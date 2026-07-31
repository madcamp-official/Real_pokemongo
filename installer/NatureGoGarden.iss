#define AppName "Nature Go Garden"
#define AppVersion "1.0.0"
#define AppPublisher "MADCamp Nature Go"
#define BuildRoot "..\unity\BeetleDuel\Builds\Windows\NatureGoGarden"

[Setup]
AppId={{A438471B-4348-4D5B-A521-8B7B34736760}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\Nature Go Garden
DefaultGroupName=Nature Go Garden
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\dist\windows
OutputBaseFilename=NatureGoGarden-Setup-{#AppVersion}
Compression=lzma2/normal
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
UninstallDisplayIcon={app}\NatureGoGarden.exe

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Files]
Source: "{#BuildRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Nature Go Garden"; Filename: "{app}\NatureGoGarden.exe"
Name: "{autodesktop}\Nature Go Garden"; Filename: "{app}\NatureGoGarden.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "바탕 화면 바로 가기 만들기"; GroupDescription: "추가 아이콘:"

[Run]
Filename: "{app}\NatureGoGarden.exe"; Description: "Nature Go Garden 실행"; Flags: nowait postinstall skipifsilent
