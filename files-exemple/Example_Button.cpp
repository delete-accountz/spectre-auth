#include "FileDownloader.hpp"

// Call this from your button/event handler.
//
// IMPORTANT:
// Replace the API URL with your real Railway API URL.
// Replace "MyLoader.dll" with the exact file name shown in the Dashboard.

void OnDownloadButtonClicked()
{
    const auto result = SpectreFiles::DownloadLatestFile(
        "https://YOUR-API.up.railway.app",
        "MyLoader.dll"
    );

    if (result.success)
    {
        // result.path contains something similar to:
        // C:\Users\YourUser\AppData\Local\Temp\MyLoader.dll
        //
        // The example ONLY downloads the file.
        // It does not execute the DLL/EXE.
    }
    else
    {
        // Log/display result.error
    }
}
