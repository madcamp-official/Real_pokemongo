using UnityEngine;

public sealed class PCGardenOrbitCamera : MonoBehaviour
{
    public Camera targetCamera;
    public Vector3 overviewTarget = new Vector3(0f, 30f, 17f);
    public float overviewDistance = 94f;
    public float overviewYaw = 0f;
    public float minDistance = 3f;
    public float maxDistance = 135f;

    private Vector3 target;
    private Vector3 desiredTarget;
    private float distance;
    private float desiredDistance;
    private float yaw;
    private float pitch;
    private PCGardenCreatureView selected;
    private Vector3 leftPointerDownPosition;
    private Vector3 previousPointerPosition;
    private bool leftPointerDragging;
    private bool leftPointerStartedOverUi;
    private PCGardenController gardenController;

    public PCGardenCreatureView Selected => selected;

    private void Awake()
    {
        if (targetCamera == null)
            targetCamera = Camera.main;
        gardenController = FindFirstObjectByType<PCGardenController>();

        target = overviewTarget;
        desiredTarget = overviewTarget;
        distance = overviewDistance;
        desiredDistance = overviewDistance;
        yaw = overviewYaw;
        pitch = 1.1f;
    }

    private void Update()
    {
        if (targetCamera == null)
            return;

        HandlePointerSelection();
        HandleOrbitInput();
        UpdateCamera();
    }

    public void ShowOverview()
    {
        selected = null;
        desiredTarget = overviewTarget;
        desiredDistance = overviewDistance;
        yaw = overviewYaw;
        pitch = 1.1f;
    }

    public void Focus(PCGardenCreatureView creature)
    {
        if (creature == null)
        {
            ShowOverview();
            return;
        }

        selected = creature;
        Bounds bounds = creature.CalculateWorldBounds();
        desiredTarget = bounds.center;
        desiredDistance = Mathf.Clamp(bounds.extents.magnitude * 4.5f, 4f, 22f);
    }

    public void FocusAndFollow(PCGardenCreatureView creature)
    {
        if (creature == null)
        {
            ShowOverview();
            return;
        }

        selected = creature;
        Bounds bounds = creature.CalculateWorldBounds();
        desiredTarget = bounds.center;
        desiredDistance = Mathf.Clamp(
            Mathf.Max(bounds.extents.magnitude * 7f, 20f),
            20f,
            34f);
        pitch = 20f;
    }

    private void HandlePointerSelection()
    {
        if (Input.GetKeyDown(KeyCode.Escape))
        {
            ShowOverview();
            return;
        }

        if (Input.GetMouseButtonDown(0))
        {
            leftPointerDownPosition = Input.mousePosition;
            previousPointerPosition = Input.mousePosition;
            leftPointerDragging = false;
            leftPointerStartedOverUi = IsPointerOverFixedUi(Input.mousePosition);
        }

        if (Input.GetMouseButton(0) && !leftPointerStartedOverUi)
        {
            Vector3 currentPointerPosition = Input.mousePosition;
            Vector3 totalDelta = currentPointerPosition - leftPointerDownPosition;
            if (totalDelta.sqrMagnitude >= 25f)
                leftPointerDragging = true;

            if (leftPointerDragging)
            {
                Vector3 frameDelta = currentPointerPosition - previousPointerPosition;
                ApplyOrbitDelta(frameDelta.x * 0.22f, frameDelta.y * 0.18f);
            }
            previousPointerPosition = currentPointerPosition;
        }

        if (!Input.GetMouseButtonUp(0))
            return;

        if (!leftPointerDragging && !leftPointerStartedOverUi)
            TrySelectCreature(Input.mousePosition);

        leftPointerDragging = false;
        leftPointerStartedOverUi = false;
    }

    private void HandleOrbitInput()
    {
        if (Input.GetMouseButton(1))
            ApplyOrbitDelta(
                Input.GetAxis("Mouse X") * 3.2f,
                Input.GetAxis("Mouse Y") * 2.2f);

        float wheel = Input.GetAxis("Mouse ScrollWheel");
        if (Mathf.Abs(wheel) > 0.0001f)
        {
            desiredDistance *= 1f - wheel * 1.6f;
            desiredDistance = Mathf.Clamp(desiredDistance, minDistance, maxDistance);
        }

        float panSpeed = Mathf.Max(5f, desiredDistance * 0.16f)
            * Time.unscaledDeltaTime;
        if (Input.GetKey(KeyCode.LeftShift)
            || Input.GetKey(KeyCode.RightShift))
            panSpeed *= 2.5f;

        Vector3 pan = new Vector3(
            Input.GetAxisRaw("Horizontal"),
            0f,
            Input.GetAxisRaw("Vertical"));
        float verticalPan = 0f;
        if (Input.GetKey(KeyCode.E) || Input.GetKey(KeyCode.PageUp))
            verticalPan += 1f;
        if (Input.GetKey(KeyCode.Q) || Input.GetKey(KeyCode.PageDown))
            verticalPan -= 1f;

        if (pan.sqrMagnitude > 0.01f || Mathf.Abs(verticalPan) > 0.01f)
            ApplyNavigation(pan, verticalPan, panSpeed);
    }

    private void ApplyNavigation(
        Vector3 planarInput,
        float verticalInput,
        float movementDistance)
    {
        // A focused creature continually updates desiredTarget. Clear the
        // focus as soon as the user deliberately starts navigating so WASD
        // is never overwritten by the follow camera.
        selected = null;
        Vector3 right = Vector3.ProjectOnPlane(
            targetCamera.transform.right,
            Vector3.up).normalized;
        Vector3 forward = Vector3.ProjectOnPlane(
            targetCamera.transform.forward,
            Vector3.up).normalized;
        desiredTarget += (
            right * planarInput.x
            + forward * planarInput.z
            + Vector3.up * verticalInput) * movementDistance;
    }

    private void ApplyOrbitDelta(float horizontal, float vertical)
    {
        yaw += horizontal;
        pitch -= vertical;
        pitch = Mathf.Clamp(pitch, -8f, 68f);
    }

    private void TrySelectCreature(Vector3 pointerPosition)
    {
        // Small moving creatures can be visually in front of a large tree while
        // the tree's broad box collider still receives the ray first. Prefer the
        // creature whose rendered screen bounds and centre match the pointer.
        PCGardenCreatureView screenCandidate = FindScreenCandidate(pointerPosition);
        if (screenCandidate != null)
        {
            Focus(screenCandidate);
            return;
        }

        Ray ray = targetCamera.ScreenPointToRay(pointerPosition);
        RaycastHit[] hits = Physics.RaycastAll(ray, 500f);
        System.Array.Sort(hits, (left, right) =>
            left.distance.CompareTo(right.distance));
        for (int index = 0; index < hits.Length; index++)
        {
            PCGardenCreatureView view =
                hits[index].collider.GetComponentInParent<PCGardenCreatureView>();
            if (view == null)
                continue;
            Focus(view);
            return;
        }
    }

    private PCGardenCreatureView FindScreenCandidate(Vector3 pointerPosition)
    {
        PCGardenCreatureView best = null;
        float bestScore = float.PositiveInfinity;
        PCGardenCreatureView[] views = FindObjectsByType<PCGardenCreatureView>();
        for (int index = 0; index < views.Length; index++)
        {
            PCGardenCreatureView view = views[index];
            if (view == null || !view.gameObject.activeInHierarchy)
                continue;
            if (!TryCalculateScreenRect(
                    view.CalculateWorldBounds(),
                    out Rect screenRect,
                    out Vector3 screenCentre))
                continue;

            float minimumPickSize = view.GetComponent<FlyingInsectFlight>() != null
                || view.GetComponent<ButterflyFlight>() != null
                ? 42f
                : 28f;
            float width = Mathf.Max(screenRect.width, minimumPickSize);
            float height = Mathf.Max(screenRect.height, minimumPickSize);
            Rect pickRect = new Rect(
                screenRect.center.x - (width * 0.5f),
                screenRect.center.y - (height * 0.5f),
                width,
                height);
            if (!pickRect.Contains(pointerPosition))
                continue;

            Vector2 delta = (Vector2)pointerPosition
                - new Vector2(screenCentre.x, screenCentre.y);
            float normalizedDistance = delta.sqrMagnitude
                / Mathf.Max(width * height, 1f);
            float score = normalizedDistance + (screenCentre.z * 0.00001f);
            if (score >= bestScore)
                continue;
            bestScore = score;
            best = view;
        }
        return best;
    }

    private bool TryCalculateScreenRect(
        Bounds bounds,
        out Rect screenRect,
        out Vector3 screenCentre)
    {
        screenCentre = targetCamera.WorldToScreenPoint(bounds.center);
        if (screenCentre.z <= 0f)
        {
            screenRect = default;
            return false;
        }

        Vector3 minimum = new Vector3(
            float.PositiveInfinity,
            float.PositiveInfinity,
            0f);
        Vector3 maximum = new Vector3(
            float.NegativeInfinity,
            float.NegativeInfinity,
            0f);
        Vector3 extents = bounds.extents;
        for (int x = -1; x <= 1; x += 2)
        {
            for (int y = -1; y <= 1; y += 2)
            {
                for (int z = -1; z <= 1; z += 2)
                {
                    Vector3 corner = bounds.center + Vector3.Scale(
                        extents,
                        new Vector3(x, y, z));
                    Vector3 point = targetCamera.WorldToScreenPoint(corner);
                    if (point.z <= 0f)
                        continue;
                    minimum.x = Mathf.Min(minimum.x, point.x);
                    minimum.y = Mathf.Min(minimum.y, point.y);
                    maximum.x = Mathf.Max(maximum.x, point.x);
                    maximum.y = Mathf.Max(maximum.y, point.y);
                }
            }
        }

        if (float.IsInfinity(minimum.x) || float.IsInfinity(minimum.y))
        {
            screenRect = default;
            return false;
        }
        screenRect = Rect.MinMaxRect(
            minimum.x,
            minimum.y,
            maximum.x,
            maximum.y);
        return true;
    }

    private bool IsPointerOverFixedUi(Vector3 pointerPosition)
    {
        float guiY = Screen.height - pointerPosition.y;
        bool overHeroHeader = guiY <= 150f;
        float inventoryHeight = gardenController != null
            ? gardenController.InventoryUiHeight
            : 356f;
        bool overInventory = guiY >= Screen.height - inventoryHeight;
        return overHeroHeader || overInventory;
    }

    private void UpdateCamera()
    {
        if (selected != null)
            desiredTarget = selected.CalculateWorldBounds().center;

        float targetBlend = 1f - Mathf.Exp(-5.5f * Time.unscaledDeltaTime);
        target = Vector3.Lerp(target, desiredTarget, targetBlend);
        distance = Mathf.Lerp(distance, desiredDistance, targetBlend);

        Quaternion rotation = Quaternion.Euler(pitch, yaw, 0f);
        Vector3 direction = rotation * Vector3.back;
        targetCamera.transform.position = target + direction * distance;
        targetCamera.transform.rotation = Quaternion.LookRotation(
            target - targetCamera.transform.position,
            Vector3.up);
    }
}
