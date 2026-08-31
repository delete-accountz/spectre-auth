#include "Interface.hpp"

#include "ext/Discord/DiscordRPC.hpp"

// ── Auth nova (substitui SafetySDK) ──────────────────────────────────────────
#include "Auth.h"   // ajuste o path se necessário (ex: "ext/Auth/Auth.h")
// ─────────────────────────────────────────────────────────────────────────────

#define LUX_PRODUCT_HASH "38043b77eb0167490f329466da96cf6c3dda0a370f5a9daac8efc69a9897faa3"

#include "Notify/Notify.hpp"
#include <Main/Memory/Memory.hpp>
#include <Cheat/saveconfig.cpp>
#include <Cheat/SharedMemory.h>

#include <cmath>
#include <cctype>
#include <string>
#include <vector>
#include <ctime>
#include <cstdio>
#include <cstdlib>
#include <algorithm>
#include <atomic>
#include <thread>
#include <chrono>
#include <XorStr.hpp>

extern IMGUI_IMPL_API LRESULT ImGui_ImplWin32_WndProcHandler(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);

// ── Auth state ───────────────────────────────────────────────────────────────
static char  g_Hwid[128]     = "";
static char  g_LoginKey[128] = "";
static int   g_DaysLeft      = 0;       // dias restantes retornados pela API
static bool  g_SaveLogin     = false;
static bool  g_AttemptedLoadAuth = false;
// ─────────────────────────────────────────────────────────────────────────────

#include "AuthCache.hpp"

#include <winhttp.h>
#include <wincodec.h>
#pragma comment(lib, "winhttp.lib")

static GLuint g_AvatarTexture     = 0;
static int    g_AvatarWidth       = 0;
static int    g_AvatarHeight      = 0;
static bool   g_AvatarTextureReady = false;

static std::string g_DiscordUsername = "User";

static std::atomic<bool> g_InterfaceShuttingDown{ false };
static std::atomic<bool> g_LoginWorkerRunning{ false };
static std::atomic<bool> g_RestartWorkerRunning{ false };
static std::atomic<bool> g_AutoRestartStop{ true };
static std::atomic<bool> g_AutoUnloadRequested{ false };
static std::atomic<bool> g_LicenseAuthenticated{ false };

static std::thread g_AutoRestartThread;

static void StartAutoRestartWorker()
{
    if (g_AutoRestartThread.joinable())
        return;

    g_AutoRestartStop = false;
    g_AutoRestartThread = std::thread([]()
    {
        constexpr int restartIntervalSeconds = 30;
        while (!g_AutoRestartStop.load() && !g_InterfaceShuttingDown.load())
        {
            for (int elapsed = 0;
                elapsed < restartIntervalSeconds * 10 &&
                !g_AutoRestartStop.load() &&
                !g_InterfaceShuttingDown.load();
                ++elapsed)
            {
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
            }

            if (g_AutoRestartStop.load() || g_InterfaceShuttingDown.load())
                break;

            if (g_RestartWorkerRunning.exchange(true))
                continue;

            try
            {
                g_FreeFireMemory.Restart();
                if (!g_InterfaceShuttingDown.load())
                    NotifyManager::Send(XorStr("Restart automático concluído"), 4000);
            }
            catch (...)
            {
                if (!g_InterfaceShuttingDown.load())
                    NotifyManager::Send(XorStr("Falha no restart automático"), 4000);
            }

            g_RestartWorkerRunning = false;
        }
    });
}

static void StopAutoRestartWorker()
{
    g_AutoRestartStop = true;
    if (g_AutoRestartThread.joinable())
        g_AutoRestartThread.join();
}

// ── Expiry text usando g_DaysLeft da nossa API ────────────────────────────────
static std::string GetExpiryDaysText()
{
    if (g_DaysLeft < 0)
        return "Expiry: Expired";
    if (g_DaysLeft == 0)
        return "Expiry: Less than 1 day";
    if (g_DaysLeft > 365)
        return "Expiry: Lifetime";
    return "Expiry: " + std::to_string(g_DaysLeft) + " days";
}
// ─────────────────────────────────────────────────────────────────────────────

static void UpdateDiscordProfileTexture()
{
    const std::string rpcName = DiscordRPC::GetUsername();
    if (!rpcName.empty())
        g_DiscordUsername = rpcName;

    DiscordRPC::AvatarData avatar{};
    if (!DiscordRPC::GetAvatarData(avatar))
        return;

    if (!avatar.pixels || avatar.width <= 0 || avatar.height <= 0)
        return;

    if (g_AvatarTexture != 0 &&
        g_AvatarWidth  == avatar.width &&
        g_AvatarHeight == avatar.height)
    {
        return;
    }

    GLuint texture = 0;
    glGenTextures(1, &texture);
    if (texture == 0) return;

    glBindTexture(GL_TEXTURE_2D, texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA,
        avatar.width, avatar.height, 0,
        GL_RGBA, GL_UNSIGNED_BYTE, avatar.pixels);
    glBindTexture(GL_TEXTURE_2D, 0);

    if (g_AvatarTexture != 0)
        glDeleteTextures(1, &g_AvatarTexture);

    g_AvatarTexture      = texture;
    g_AvatarWidth        = avatar.width;
    g_AvatarHeight       = avatar.height;
    g_AvatarTextureReady = true;
}

static float  g_WindowScale = 0.0f;
static float  g_WindowAlpha = 0.0f;
static float  g_ContentAlpha = 0.0f;
static ImVec2 g_WindowPos   = ImVec2(-1, -1);
static bool   g_Dragging    = false;
static ImVec2 g_DragOffset  = ImVec2(0, 0);

void Interface::Initialize(HWND Window, HWND TargetWindow, HDC DeviceContext, HGLRC RenderContext)
{
    hWindow       = Window;
    hTargetWindow = TargetWindow;
    hDeviceContext = DeviceContext;
    hRenderContext = RenderContext;

    wglMakeCurrent(hDeviceContext, hRenderContext);

    ImGui::CreateContext();
    ImGui_ImplWin32_Init(hWindow);
    ImGui_ImplOpenGL3_Init(XorStr("#version 130"));
    InitializeMenu();

    g_InterfaceShuttingDown = false;
    g_AutoUnloadRequested   = false;
    g_LicenseAuthenticated  = false;

    DiscordRPC::Tick(true);

    // ── Inicializa nossa auth ──────────────────────────────────────────────
    std::string hashErr;
    SetProductHash(LUX_PRODUCT_HASH, hashErr);

    std::string hwid = GenerateHWID();
    if (hwid.empty()) hwid = "HWID_UNAVAILABLE";
    strncpy_s(g_Hwid, sizeof(g_Hwid), hwid.c_str(), _TRUNCATE);
    // ──────────────────────────────────────────────────────────────────────

    NotifyManager::Send(XorStr("Bem Vindo(a)"), 4000);
}

void Interface::InitializeMenu()
{
    bIsMenuOpen = true;
    SetWindowLong(hWindow, GWL_EXSTYLE, WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED);
    SetWindowPos(hWindow, HWND_TOPMOST, 0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    SetForegroundWindow(hWindow);
}

void Interface::UpdateStyle()
{
    ImGuiIO&    io    = ImGui::GetIO();
    ImGuiStyle* Style = &ImGui::GetStyle();

    Style->AntiAliasedLines      = true;
    Style->AntiAliasedLinesUseTex = true;
    Style->AntiAliasedFill       = true;
    io.IniFilename = nullptr;
    io.LogFilename = nullptr;

    Style->WindowRounding   = 14.0f;
    Style->WindowBorderSize = 0;
    Style->WindowPadding    = ImVec2(0, 0);
    Style->FrameBorderSize  = 0;
    Style->FrameRounding    = 8.0f;
    Style->WindowShadowSize = 0.0f;
    Style->ScrollbarSize    = 5.0f;
    Style->ScrollbarRounding = 3.0f;
    Style->PopupRounding    = 10.0f;
    Style->GrabRounding     = 6.0f;

    Style->Colors[ImGuiCol_Separator]         = ImColor(40, 40, 48, 255);
    Style->Colors[ImGuiCol_SeparatorActive]   = ImColor(200, 0, 0, 255);
    Style->Colors[ImGuiCol_SeparatorHovered]  = ImColor(200, 0, 0, 150);
    Style->Colors[ImGuiCol_ResizeGrip]        = ImColor(0, 0, 0, 0);
    Style->Colors[ImGuiCol_ResizeGripActive]  = ImColor(0, 0, 0, 0);
    Style->Colors[ImGuiCol_ResizeGripHovered] = ImColor(0, 0, 0, 0);
    Style->Colors[ImGuiCol_ScrollbarBg]       = ImColor(0, 0, 0, 0);
    Style->Colors[ImGuiCol_ScrollbarGrab]     = ImColor(200, 0, 0, 90);
    Style->Colors[ImGuiCol_ScrollbarGrabActive]  = ImColor(200, 0, 0, 255);
    Style->Colors[ImGuiCol_ScrollbarGrabHovered] = ImColor(200, 0, 0, 180);
    Style->Colors[ImGuiCol_WindowBg]          = ImColor(12, 12, 12, 255);
    Style->Colors[ImGuiCol_ChildBg]           = ImColor(0, 0, 0, 0);
    Style->Colors[ImGuiCol_Border]            = ImColor(45, 45, 45, 255);
    Style->Colors[ImGuiCol_Text]              = ImColor(240, 238, 245, 255);
    Style->Colors[ImGuiCol_TextSelectedBg]    = ImColor(200, 0, 0, 80);
    Style->Colors[ImGuiCol_PopupBg]           = ImColor(18, 18, 18, 250);
    Style->Colors[ImGuiCol_FrameBg]           = ImColor(22, 22, 22, 255);
    Style->Colors[ImGuiCol_FrameBgHovered]    = ImColor(30, 30, 30, 255);
    Style->Colors[ImGuiCol_FrameBgActive]     = ImColor(40, 40, 40, 255);
    Style->Colors[ImGuiCol_Header]            = ImColor(200, 0, 0, 60);
    Style->Colors[ImGuiCol_HeaderHovered]     = ImColor(200, 0, 0, 100);
    Style->Colors[ImGuiCol_HeaderActive]      = ImColor(200, 0, 0, 160);

    Fonts::Initialize();
}

void DrawDock(ImDrawList* dl, ImVec2 windowPos, ImVec2 windowSize, int& currentTab, float alpha)
{
    const float dockHeight  = 56.0f;
    const float dockPadding = 12.0f;
    const float itemSize    = 44.0f;
    const float itemSpacing = 14.0f;
    const int   numItems    = 5;

    float dockWidth = (itemSize + itemSpacing) * numItems - itemSpacing + dockPadding * 2;
    float dockX = windowPos.x + (windowSize.x - dockWidth) * 0.5f;
    float dockY = windowPos.y + windowSize.y - dockHeight - 16.0f;

    ImVec2 dockMin = ImVec2(dockX, dockY);
    ImVec2 dockMax = ImVec2(dockX + dockWidth, dockY + dockHeight);

    dl->AddRectFilled(dockMin + ImVec2(0, 4), dockMax + ImVec2(0, 4),
        IM_COL32(0, 0, 0, (int)(30 * alpha)), 18.0f);
    dl->AddRectFilled(dockMin, dockMax, IM_COL32(18, 18, 18, (int)(245 * alpha)), 18.0f);
    dl->AddRect(dockMin, dockMax, IM_COL32(45, 45, 45, (int)(120 * alpha)), 18.0f, 0, 1.0f);

    struct DockItemData { const char* icon; const char* label; };

    static char dock_labels[5][16] = {};
    static bool dock_init = false;
    if (!dock_init)
    {
        strcpy_s(dock_labels[0], XorStr("Aimbot"));
        strcpy_s(dock_labels[1], XorStr("Silent"));
        strcpy_s(dock_labels[2], XorStr("Exploits"));
        strcpy_s(dock_labels[3], XorStr("ESP"));
        strcpy_s(dock_labels[4], XorStr("Config"));
        dock_init = true;
    }

    DockItemData items[] = {
        { ICON_FA_CROSSHAIRS, dock_labels[0] },
        { ICON_FA_GHOST,      dock_labels[1] },
        { ICON_FA_BOLT,       dock_labels[2] },
        { ICON_FA_EYE,        dock_labels[3] },
        { ICON_FA_GEAR,       dock_labels[4] },
    };

    static float hoverAnims[5]    = { 0,0,0,0,0 };
    static float activeAnims[5]   = { 0,0,0,0,0 };
    static float bounceAnims[5]   = { 0,0,0,0,0 };
    static float bounceVelocity[5]= { 0,0,0,0,0 };

    ImGuiIO& io = ImGui::GetIO();
    float dt = ImClamp(io.DeltaTime, 0.0001f, 0.1f);

    auto smoothLerp = [](float cur, float tgt, float spd, float dt) -> float {
        return cur + (tgt - cur) * (1.0f - expf(-spd * dt));
    };

    extern ImGuiID activeCombo;
    extern ImGuiID activeColorPicker;
    extern ImRect  activeComboPopupRect;

    bool mouseOverComboPopup = false;
    if (activeCombo != 0)
    {
        mouseOverComboPopup =
            io.MousePos.x >= activeComboPopupRect.Min.x &&
            io.MousePos.x <= activeComboPopupRect.Max.x &&
            io.MousePos.y >= activeComboPopupRect.Min.y &&
            io.MousePos.y <= activeComboPopupRect.Max.y;
    }
    bool blockDockInteraction = ((activeCombo != 0) && mouseOverComboPopup) || (activeColorPicker != 0);

    float startX = dockX + dockPadding;
    float itemY  = dockY + (dockHeight - itemSize) * 0.5f;

    for (int i = 0; i < numItems; i++)
    {
        float  itemX    = startX + i * (itemSize + itemSpacing);
        ImVec2 itemMin  = ImVec2(itemX, itemY);
        ImVec2 itemMax  = ImVec2(itemX + itemSize, itemY + itemSize);

        bool isHovered = !blockDockInteraction &&
            io.MousePos.x >= itemMin.x && io.MousePos.x <= itemMax.x &&
            io.MousePos.y >= itemMin.y && io.MousePos.y <= itemMax.y;
        bool isActive = (currentTab == i + 1);

        hoverAnims[i]  = smoothLerp(hoverAnims[i],  isHovered ? 1.0f : 0.0f, 12.0f, dt);
        activeAnims[i] = smoothLerp(activeAnims[i], isActive  ? 1.0f : 0.0f, 10.0f, dt);

        if (isHovered && ImGui::IsMouseClicked(0) && !blockDockInteraction)
        {
            currentTab = i + 1;
            bounceVelocity[i] = -140.0f;
        }

        float springForce   = -800.0f * bounceAnims[i];
        float dampingForce  = -12.0f  * bounceVelocity[i];
        bounceVelocity[i]  += (springForce + dampingForce) * dt;
        bounceAnims[i]     += bounceVelocity[i] * dt;
        if (fabsf(bounceAnims[i]) < 0.1f && fabsf(bounceVelocity[i]) < 1.0f)
        {
            bounceAnims[i]    = 0.0f;
            bounceVelocity[i] = 0.0f;
        }

        float totalOffset = hoverAnims[i] * 3.0f + bounceAnims[i];
        ImVec2 drawMin = ImVec2(itemMin.x, itemMin.y - totalOffset);
        ImVec2 drawMax = ImVec2(itemMax.x, itemMax.y - totalOffset);
        ImVec2 center  = ImVec2((drawMin.x + drawMax.x) * 0.5f, (drawMin.y + drawMax.y) * 0.5f);

        float t = activeAnims[i];
        ImU32 bgColor = IM_COL32(
            (int)(18.0f * (1.0f - t) + 200.0f * t),
            (int)(18.0f * (1.0f - t) +  25.0f * t),
            (int)(18.0f * (1.0f - t) +  25.0f * t),
            (int)(255 * alpha)
        );
        dl->AddRectFilled(drawMin, drawMax, bgColor, 12.0f);

        if (t < 0.5f)
        {
            dl->AddRect(drawMin, drawMax,
                IM_COL32(45 + (int)(20 * hoverAnims[i]),
                         45 + (int)(20 * hoverAnims[i]),
                         45 + (int)(20 * hoverAnims[i]),
                         (int)(80 * alpha)),
                12.0f, 0, 1.0f);
        }

        ImGui::PushFont(Fonts::FontAwesomeSolid);
        ImVec2 iconSize = ImGui::CalcTextSize(items[i].icon);
        ImVec2 iconPos  = ImVec2(center.x - iconSize.x * 0.5f, center.y - iconSize.y * 0.5f);
        ImU32 iconColor = IM_COL32(
            (int)(140 + 100 * t + 40 * hoverAnims[i] * (1 - t)),
            (int)(140 + 100 * t + 35 * hoverAnims[i] * (1 - t)),
            (int)(140 + 100 * t + 30 * hoverAnims[i] * (1 - t)),
            (int)(255 * alpha)
        );
        dl->AddText(iconPos, iconColor, items[i].icon);
        ImGui::PopFont();

        if (isHovered)
        {
            ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(8, 6));
            ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 6.0f);
            ImGui::PushStyleColor(ImGuiCol_PopupBg, ImVec4(0.12f, 0.12f, 0.15f, 0.95f));
            ImGui::PushStyleColor(ImGuiCol_Border,  ImVec4(0.25f, 0.25f, 0.30f, 1.0f));
            ImGui::BeginTooltip();
            ImGui::PushFont(Fonts::InterMedium);
            ImGui::TextUnformatted(items[i].label);
            ImGui::PopFont();
            ImGui::EndTooltip();
            ImGui::PopStyleColor(2);
            ImGui::PopStyleVar(2);
        }

        if (activeAnims[i] > 0.1f)
        {
            ImVec2 dotPos = ImVec2(center.x, drawMax.y + 6.0f);
            dl->AddCircleFilled(dotPos, 2.5f,
                IM_COL32(200, 0, 0, (int)(255 * activeAnims[i] * alpha)), 12);
        }
    }
}

static bool  g_WantShutdown      = false;
static float g_ShutdownProgress  = 0.0f;
static float g_ShutdownScale     = 1.0f;
static float g_ShutdownAlpha     = 1.0f;
static float g_ShutdownRotation  = 0.0f;

static void RequestAutomaticUnload()
{
    g_AutoUnloadRequested.store(true, std::memory_order_release);
}

static void EvaluateLicenseForAutomaticUnload()
{
    if (!g_LicenseAuthenticated.load(std::memory_order_acquire))
        return;

    // Usa g_DaysLeft da nossa API
    if (g_DaysLeft < 0)
        RequestAutomaticUnload();
}

void Interface::RenderGui()
{
    if (g_InterfaceShuttingDown)
        return;

    // Stream Mode (Anti-Captura)
    static bool lastStreamModeState = false;
    bool currentStreamMode = g_Globals.General.CaptureBypass;
    if (currentStreamMode != lastStreamModeState)
    {
        Overlay::SetStreamMode(currentStreamMode);
        lastStreamModeState = currentStreamMode;
        NotifyManager::Send(currentStreamMode
            ? XorStr("Stream Mode: Invisível em gravações!")
            : XorStr("Stream Mode Desativado!"), 3000);
    }

    ImGuiIO& io = ImGui::GetIO();
    float dt = ImClamp(io.DeltaTime, 0.0001f, 0.1f);

    auto smoothLerp = [](float cur, float tgt, float spd, float dt) -> float {
        return cur + (tgt - cur) * (1.0f - expf(-spd * dt));
    };

    EvaluateLicenseForAutomaticUnload();

    if (g_AutoUnloadRequested.exchange(false, std::memory_order_acq_rel))
        g_WantShutdown = true;

    if (g_WantShutdown)
    {
        g_ShutdownProgress += dt * 3.5f;
        float t       = g_ShutdownProgress;
        float easeOut = 1.0f - (1.0f - t) * (1.0f - t);
        g_ShutdownScale    = 1.0f - easeOut * 0.3f;
        g_ShutdownAlpha    = 1.0f - easeOut;
        g_ShutdownRotation = easeOut * 3.0f;
        if (g_ShutdownProgress >= 1.0f)
        {
            g_Globals.General.ShutDown = true;
            return;
        }
    }

    UpdateDiscordProfileTexture();

    float targetScale = bIsMenuOpen ? 1.0f  : 0.95f;
    float targetAlpha = bIsMenuOpen ? 1.0f  : 0.0f;
    g_WindowScale  = smoothLerp(g_WindowScale,  targetScale, bIsMenuOpen ? 12.0f : 25.0f, dt);
    g_WindowAlpha  = smoothLerp(g_WindowAlpha,  targetAlpha, bIsMenuOpen ? 10.0f : 30.0f, dt);
    g_ContentAlpha = smoothLerp(g_ContentAlpha, targetAlpha, bIsMenuOpen ? 10.0f : 30.0f, dt);

    if (g_WantShutdown)
    {
        g_WindowScale  *= g_ShutdownScale;
        g_WindowAlpha  *= g_ShutdownAlpha;
        g_ContentAlpha *= g_ShutdownAlpha;
    }

    if (g_WindowAlpha < 0.01f && !g_WantShutdown) return;

    // Tab animation
    static float AnimaTab         = 0.0f;
    static float AnimaTabVelocity = 0.0f;
    static int   LastCurrentTab   = 0;
    if (LastCurrentTab != CurrentTab)
    {
        AnimaTab         = (LastCurrentTab > CurrentTab) ? -30.f :  30.f;
        AnimaTabVelocity = (LastCurrentTab > CurrentTab) ? -200.f : 200.f;
        LastCurrentTab   = CurrentTab;
    }
    {
        float sf = -180.0f * AnimaTab  + -18.0f * AnimaTabVelocity;
        AnimaTabVelocity += sf * dt;
        AnimaTab         += AnimaTabVelocity * dt;
        if (fabsf(AnimaTab) < 0.1f && fabsf(AnimaTabVelocity) < 1.0f)
        { AnimaTab = 0.0f; AnimaTabVelocity = 0.0f; }
    }

    static int   CurrentSub      = 0;
    static int   LastCurrentSub  = 0;
    static float SubAnima        = 0.f;
    static float SubAnimaVelocity= 0.f;
    if (LastCurrentSub != CurrentSub)
    {
        SubAnima         = (LastCurrentSub > CurrentSub) ? -30.f :  30.f;
        SubAnimaVelocity = (LastCurrentSub > CurrentSub) ? -200.f : 200.f;
        LastCurrentSub   = CurrentSub;
    }
    {
        float sf = -180.0f * SubAnima + -18.0f * SubAnimaVelocity;
        SubAnimaVelocity += sf * dt;
        SubAnima         += SubAnimaVelocity * dt;
        if (fabsf(SubAnima) < 0.1f && fabsf(SubAnimaVelocity) < 1.0f)
        { SubAnima = 0.0f; SubAnimaVelocity = 0.0f; }
    }

    ImVec2 windowSize   = ImVec2(700, 460);
    ImVec2 displaySize  = io.DisplaySize;

    static bool g_WindowPosInitialized = false;
    if (!g_WindowPosInitialized)
    {
        g_WindowPos = ImVec2(
            (displaySize.x - windowSize.x) * 0.5f,
            (displaySize.y - windowSize.y) * 0.5f
        );
        g_WindowPosInitialized = true;
    }

    g_WindowPos.x = ImClamp(g_WindowPos.x, -windowSize.x + 100.0f, displaySize.x - 100.0f);
    g_WindowPos.y = ImClamp(g_WindowPos.y,  0.0f, displaySize.y - 50.0f);

    ImVec2 scaledSize = windowSize * g_WindowScale;
    ImVec2 scaledPos  = g_WindowPos + (windowSize - scaledSize) * 0.5f;

    if (g_WantShutdown)
        scaledPos.y -= g_ShutdownProgress * 30.0f;

    ImGui::SetNextWindowPos(scaledPos);
    ImGui::SetNextWindowSize(scaledSize);
    ImGui::PushStyleVar(ImGuiStyleVar_Alpha, g_WindowAlpha);
    ImGui::Begin(XorStr("Spectre Cheats"), nullptr,
        ImGuiWindowFlags_NoDecoration |
        ImGuiWindowFlags_NoScrollWithMouse |
        ImGuiWindowFlags_NoMove);
    {
        ImDrawList* DrawList = ImGui::GetWindowDrawList();
        ImVec2 Pos  = ImGui::GetWindowPos();
        ImVec2 Size = ImGui::GetWindowSize();

        static ImGuiID lastFrameHoveredId = 0;
        ImGuiContext& gc = *GImGui;

        bool scrollbarActive = false;
        if (gc.ActiveId != 0)
        {
            ImGuiWindow* activeWindow = gc.ActiveIdWindow;
            if (activeWindow)
            {
                ImGuiID scrollYId = ImGui::GetWindowScrollbarID(activeWindow, ImGuiAxis_Y);
                ImGuiID scrollXId = ImGui::GetWindowScrollbarID(activeWindow, ImGuiAxis_X);
                if (gc.ActiveId == scrollYId || gc.ActiveId == scrollXId)
                    scrollbarActive = true;
            }
        }

        bool canStartDrag = false;
        if (CurrentTab == 0)
        {
            float headerHeight = 60.0f;
            bool inHeader = io.MousePos.y >= Pos.y && io.MousePos.y <= Pos.y + headerHeight &&
                            io.MousePos.x >= Pos.x && io.MousePos.x <= Pos.x + Size.x;
            float formLeft  = Pos.x + (Size.x - 320) * 0.5f - 20;
            float formRight = formLeft + 360;
            float formTop   = Pos.y + 130;
            float formBottom= Pos.y + 340;
            bool inForm = io.MousePos.x >= formLeft && io.MousePos.x <= formRight &&
                          io.MousePos.y >= formTop  && io.MousePos.y <= formBottom;
            bool inWindow = io.MousePos.x >= Pos.x && io.MousePos.x <= Pos.x + Size.x &&
                            io.MousePos.y >= Pos.y && io.MousePos.y <= Pos.y + Size.y;
            canStartDrag = inWindow && (inHeader || !inForm);
        }
        else
        {
            float headerHeight = 55.0f;
            bool inHeader = io.MousePos.y >= Pos.y && io.MousePos.y <= Pos.y + headerHeight &&
                            io.MousePos.x >= Pos.x && io.MousePos.x <= Pos.x + Size.x;

            const float dockHeight  = 56.0f;
            const float dockPadding = 12.0f;
            const float itemSz      = 44.0f;
            const float itemSp      = 14.0f;
            const int   nItems      = 5;
            float dockWidth = (itemSz + itemSp) * nItems - itemSp + dockPadding * 2;
            float dockX     = Pos.x + (Size.x - dockWidth) * 0.5f;
            float dockY     = Pos.y + Size.y - dockHeight - 16.0f;

            bool inDockArea    = io.MousePos.y >= dockY - 10 && io.MousePos.y <= Pos.y + Size.y;
            bool inDockButtons = false;
            if (inDockArea)
            {
                float sX = dockX + dockPadding;
                float iY = dockY + (dockHeight - itemSz) * 0.5f;
                for (int i = 0; i < nItems; i++)
                {
                    float ix = sX + i * (itemSz + itemSp);
                    if (io.MousePos.x >= ix && io.MousePos.x <= ix + itemSz &&
                        io.MousePos.y >= iY && io.MousePos.y <= iY + itemSz)
                    { inDockButtons = true; break; }
                }
            }

            bool inContentArea = io.MousePos.y >= Pos.y + headerHeight &&
                                 io.MousePos.y <= dockY - 10 &&
                                 io.MousePos.x >= Pos.x && io.MousePos.x <= Pos.x + Size.x;

            canStartDrag = inHeader ||
                           (inDockArea && !inDockButtons) ||
                           (inContentArea && lastFrameHoveredId == 0 && !scrollbarActive);
        }

        extern ImGuiID activeSlider;
        extern ImGuiID activeColorPicker;

        if (scrollbarActive) canStartDrag = false;

        if (canStartDrag && ImGui::IsMouseClicked(0) && !g_Dragging &&
            activeSlider == 0 && activeColorPicker == 0)
        {
            g_Dragging   = true;
            g_DragOffset = ImVec2(io.MousePos.x - g_WindowPos.x,
                                  io.MousePos.y - g_WindowPos.y);
        }
        if (CustomDrag::WantDrag && !g_Dragging &&
            activeSlider == 0 && activeColorPicker == 0 && !scrollbarActive)
        {
            g_Dragging   = true;
            g_DragOffset = ImVec2(CustomDrag::DragClickPos.x - g_WindowPos.x,
                                  CustomDrag::DragClickPos.y - g_WindowPos.y);
        }
        CustomDrag::WantDrag = false;

        if (g_Dragging && (activeSlider != 0 || activeColorPicker != 0 || scrollbarActive))
            g_Dragging = false;

        if (g_Dragging)
        {
            if (ImGui::IsMouseDown(0))
                g_WindowPos = ImVec2(io.MousePos.x - g_DragOffset.x,
                                     io.MousePos.y - g_DragOffset.y);
            else
                g_Dragging = false;
        }

        lastFrameHoveredId = gc.HoveredId;

        DrawList->AddRect(Pos, Pos + Size,
            IM_COL32(50, 50, 58, (int)(150 * g_WindowAlpha)), 14.0f, 0, 1.0f);

        // ════════════════════════════════════════════════════════════════════
        // TAB 0 — TELA DE LOGIN
        // ════════════════════════════════════════════════════════════════════
        if (CurrentTab == 0)
        {
            float centerX = (Size.x - 320) * 0.5f;
            float centerY = 200;

            ImGui::PushStyleVar(ImGuiStyleVar_Alpha, g_WindowAlpha);
            ImGui::SetCursorPos(ImVec2(0, 15));
            Custom::TabHeader(XorStr("LoginHeader"), &CurrentSub, { XorStr("Login") }, CurrentTab);
            ImGui::PopStyleVar();

            ImVec2 logoSize = ImVec2(130, 130);
            ImVec2 logoPos  = ImVec2(Pos.x + (Size.x - logoSize.x) * 0.5f, Pos.y + 70);
            DrawList->AddImage((ImTextureID)(intptr_t)Fonts::LogoTexture,
                logoPos, logoPos + logoSize, ImVec2(0, 0), ImVec2(1, 1),
                IM_COL32(255, 255, 255, (int)(255 * g_WindowAlpha)));

            ImGui::PushStyleVar(ImGuiStyleVar_Alpha, g_WindowAlpha);
            {
                // Campo License Key
                ImGui::SetCursorPos({ centerX, centerY });
                ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 10.0f);
                ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(14, 12));
                ImGui::PushStyleColor(ImGuiCol_FrameBg,        ImVec4(0.10f, 0.10f, 0.12f, 1.0f));
                ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, ImVec4(0.13f, 0.13f, 0.16f, 1.0f));
                ImGui::PushStyleColor(ImGuiCol_Border,         ImVec4(0.20f, 0.20f, 0.24f, 1.0f));
                ImGui::InputTextEx(XorStr("##LoginKey"), XorStr("License Key"),
                    g_LoginKey, IM_ARRAYSIZE(g_LoginKey), ImVec2(320, 44), 0);
                ImGui::PopStyleColor(3);
                ImGui::PopStyleVar(2);

                // Botão Sign In
                ImGui::SetCursorPos({ centerX, centerY + 60 });
                static bool isLoggingIn = false;

                if (Custom::Button(XorStr("Sign In"), ImVec2(320, 46)) && !isLoggingIn)
                {
                    isLoggingIn = true;
                    g_LoginWorkerRunning = true;

                    std::thread([&]()
                    {
                        struct Guard { ~Guard() { g_LoginWorkerRunning = false; } } guard;

                        isLoading = true;
                        strcpy_s(loadingMessage, sizeof(loadingMessage), XorStr("Autenticando..."));

                        std::string keyInput = g_LoginKey;
                        if (keyInput.empty())
                        {
                            NotifyManager::Send(XorStr("Insira sua License Key!"), 4000);
                            isLoading   = false;
                            isLoggingIn = false;
                            return;
                        }

                        // ── Chama nossa auth ──────────────────────────────
                        std::string authError;
                        bool ok = PerformLogin(keyInput, g_Hwid, authError);
                        // ─────────────────────────────────────────────────

                        if (ok)
                        {
                            // Pega dias restantes do Auth struct
                            g_DaysLeft = Auth.dias_restantes;

                            strcpy_s(loadingMessage, sizeof(loadingMessage), XorStr("Iniciando..."));
                            std::this_thread::sleep_for(std::chrono::milliseconds(500));

                            g_FreeFireMemory.Initialize();
                            StartAutoRestartWorker();

                            CurrentTab = 1;
                            g_LicenseAuthenticated.store(true, std::memory_order_release);
                            g_Globals.General.EnableFuncs = true;
                            isLoading = false;

                            NotifyManager::Send(XorStr("Autenticado com sucesso!"), 4000);

                            // Mostra dias restantes
                            if (g_DaysLeft > 0)
                            {
                                std::string expireMsg = XorStr("Expira em: ") +
                                    std::to_string(g_DaysLeft) + XorStr(" dias");
                                NotifyManager::Send(expireMsg, 4000);
                            }
                        }
                        else
                        {
                            NotifyManager::Send(authError.c_str(), 4000);
                            isLoading = false;

                            // Verifica se é status terminal (banned/expired)
                            std::string errLow = authError;
                            std::transform(errLow.begin(), errLow.end(), errLow.begin(),
                                [](unsigned char c){ return (char)std::tolower(c); });

                            const bool terminal =
                                errLow.find("banned")    != std::string::npos ||
                                errLow.find("expired")   != std::string::npos ||
                                errLow.find("paused")    != std::string::npos ||
                                errLow.find("suspended") != std::string::npos;

                            if (terminal)
                                RequestAutomaticUnload();
                        }

                        isLoggingIn = false;
                    }).detach();
                }

                ImGui::SetCursorPos({ centerX, centerY + 116 });
                ImGui::PushFont(Fonts::InterMedium);
                ImGui::TextColored(ImVec4(0.5f, 0.5f, 0.55f, 1.0f), XorStr(""));
                ImGui::PopFont();
            }
            ImGui::PopStyleVar();

            if (isLoading)
            {
                DrawList->AddRectFilled(Pos, Pos + Size, IM_COL32(15, 15, 15, 220), 14.0f);
                ImVec2 wc = Size * 0.5f;
                ImGui::SetCursorPos(ImVec2(wc.x - 15, wc.y - 30));
                ImSpinner::SpinnerWaveDots(XorStr("##Loading"), 10.0f, 2.0f,
                    IM_COL32(200, 0, 0, 220));
                if (loadingMessage[0] != '\0')
                {
                    ImGui::PushFont(Fonts::InterMedium);
                    ImVec2 ts = ImGui::CalcTextSize(loadingMessage);
                    ImGui::SetCursorPos(ImVec2(wc.x - ts.x * 0.5f, wc.y + 30));
                    ImGui::TextColored(ImVec4(0.6f, 0.6f, 0.65f, 1.0f), "%s", loadingMessage);
                    ImGui::PopFont();
                }
            }
        }
        // ════════════════════════════════════════════════════════════════════
        // TABs 1-5 — MENU PRINCIPAL
        // ════════════════════════════════════════════════════════════════════
        else
        {
            float headerHeight = 55.0f;
            float dockSpace    = 90.0f;

            DrawList->AddRectFilled(Pos, Pos + ImVec2(Size.x, headerHeight),
                IM_COL32(18, 18, 18, (int)(255 * g_ContentAlpha)),
                14.0f, ImDrawFlags_RoundCornersTop);
            DrawList->AddLine(Pos + ImVec2(0, headerHeight),
                Pos + ImVec2(Size.x, headerHeight),
                IM_COL32(40, 40, 40, (int)(180 * g_ContentAlpha)));

            // Logo
            float  logoScale = 0.40f;
            ImVec2 logoSize(100.0f * logoScale, 100.0f * logoScale);
            ImVec2 logoPos(Pos.x + 16, Pos.y + (headerHeight - logoSize.y) * 0.5f);
            DrawList->AddImage((ImTextureID)(intptr_t)Fonts::LogoTexture,
                logoPos, logoPos + logoSize,
                ImVec2(0,0), ImVec2(1,1),
                IM_COL32(255, 255, 255, (int)(255 * g_ContentAlpha)));

            // Tab title
            static char tab_names[6][16] = {};
            static bool tabs_init = false;
            if (!tabs_init)
            {
                tab_names[0][0] = '\0';
                strcpy_s(tab_names[1], XorStr("Aimbot"));
                strcpy_s(tab_names[2], XorStr("Silent"));
                strcpy_s(tab_names[3], XorStr("Exploits"));
                strcpy_s(tab_names[4], XorStr("ESP"));
                strcpy_s(tab_names[5], XorStr("Config"));
                tabs_init = true;
            }

            if (CurrentTab >= 1 && CurrentTab <= 5)
            {
                ImGui::PushFont(Fonts::InterBold);
                ImVec2 ts = ImGui::CalcTextSize(tab_names[CurrentTab]);
                DrawList->AddText(
                    ImVec2(Pos.x + (Size.x - ts.x) * 0.5f, Pos.y + (headerHeight - ts.y) * 0.5f),
                    IM_COL32(220, 220, 225, (int)(255 * g_ContentAlpha)),
                    tab_names[CurrentTab]);
                ImGui::PopFont();
            }

            // Header direito: username + expiry
            {
                std::string username   = g_DiscordUsername.empty() ? "User" : g_DiscordUsername;
                std::string expiryText = GetExpiryDaysText();  // usa g_DaysLeft

                float  rightPad  = 18.0f;
                float  avatarSz  = 36.0f;
                ImVec2 avatarPos = ImVec2(
                    Pos.x + Size.x - rightPad - avatarSz,
                    Pos.y + (headerHeight - avatarSz) * 0.5f);
                ImVec2 avatarCenter = avatarPos + ImVec2(avatarSz * 0.5f, avatarSz * 0.5f);

                if (g_AvatarTexture != 0)
                {
                    DrawList->AddImageRounded(
                        (ImTextureID)(intptr_t)g_AvatarTexture,
                        avatarPos, avatarPos + ImVec2(avatarSz, avatarSz),
                        ImVec2(0,0), ImVec2(1,1),
                        IM_COL32(255, 255, 255, (int)(255 * g_ContentAlpha)),
                        avatarSz * 0.5f);
                }
                else
                {
                    DrawList->AddCircleFilled(avatarCenter, avatarSz * 0.5f,
                        IM_COL32(200, 0, 0, (int)(200 * g_ContentAlpha)), 24);
                    char letter[2] = { (char)std::toupper((unsigned char)username[0]), 0 };
                    ImGui::PushFont(Fonts::InterBold);
                    ImVec2 ls = ImGui::CalcTextSize(letter);
                    DrawList->AddText(
                        avatarPos + ImVec2((avatarSz - ls.x) * 0.5f, (avatarSz - ls.y) * 0.5f),
                        IM_COL32(255, 255, 255, (int)(255 * g_ContentAlpha)), letter);
                    ImGui::PopFont();
                }

                float textRightEdge = avatarPos.x - 10;

                ImGui::PushFont(Fonts::InterBold);
                ImVec2 nameSize = ImGui::CalcTextSize(username.c_str());
                DrawList->AddText(
                    ImVec2(textRightEdge - nameSize.x,
                           Pos.y + headerHeight * 0.5f - nameSize.y - 1),
                    IM_COL32(230, 230, 235, (int)(255 * g_ContentAlpha)),
                    username.c_str());
                ImGui::PopFont();

                ImGui::PushFont(Fonts::InterMedium);
                ImVec2 expirySize = ImGui::CalcTextSize(expiryText.c_str());
                DrawList->AddText(
                    ImVec2(textRightEdge - expirySize.x,
                           Pos.y + headerHeight * 0.5f + 2),
                    IM_COL32(120, 120, 130, (int)(255 * g_ContentAlpha)),
                    expiryText.c_str());
                ImGui::PopFont();
            }

            DrawDock(DrawList, Pos, Size, CurrentTab, g_ContentAlpha);

            float contentTop    = headerHeight + 10;
            float contentHeight = Size.y - headerHeight - dockSpace - 5;

            ImGui::SetCursorPos(ImVec2(14, contentTop));
            ImGui::PushStyleVar(ImGuiStyleVar_Alpha, g_ContentAlpha);
            ImGui::BeginChild(XorStr("ContentArea"),
                ImVec2(Size.x - 28, contentHeight),
                ImGuiChildFlags_None,
                ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
            {
                float cardWidth  = (ImGui::GetWindowSize().x - 10) * 0.5f;
                float cardHeight = contentHeight - 8;

                if (CurrentTab == 1)
                {
                    ImGui::SetCursorPos(ImVec2(AnimaTab, 0));
                    ImGui::BeginGroup();
                    {
                        Custom::CustomChild(XorStr("General"), ImVec2(cardWidth, cardHeight));
                        {
                            Custom::Checkbox(XorStr("Aimbot"), &g_Globals.AimBot.Enabled);
                            Custom::KeyBind(XorStr("AimKey"), &g_Globals.AimBot.KeyBind);
                            if (!g_Globals.General.V31)
                            {
                                Custom::Checkbox(XorStr("Pull Player"), &g_Globals.AimBot.aimmagnect);
                                Custom::KeyBind(XorStr("PullKey"), &g_Globals.AimBot.MagKey);
                            }
                            Custom::Checkbox(XorStr("Aimbot 2x"),     &g_Globals.Misc.Exploits.LocalPlayer.AimLock2x);
                            Custom::Checkbox(XorStr("Aimbot Sniper"), &g_Globals.Misc.Exploits.LocalPlayer.AimbotAwm);
                            Custom::Checkbox(XorStr("No Recoil"),     &g_Globals.Misc.Exploits.LocalPlayer.NoRecoil);
                            if (g_Globals.Misc.Exploits.LocalPlayer.NoRecoil)
                                Custom::SliderInt(XorStr("Recoil Control"),
                                    &g_Globals.Misc.Exploits.LocalPlayer.RecoilControl, 0, 100, "%d%%");
                        }
                        Custom::EndCustomChild();

                        ImGui::SetCursorPos(ImVec2(cardWidth + 10 + AnimaTab, 0));
                        Custom::CustomChild(XorStr("Config"), ImVec2(cardWidth, cardHeight));
                        {
                            if (!g_Globals.General.NoAnogs && g_Globals.AimBot.aimtype == 1)
                                g_Globals.AimBot.aimtype = 0;
                            Custom::Combo(XorStr("Aimbot Type"), &g_Globals.AimBot.aimtype,
                                g_Globals.General.NoAnogs ? XorStr("Safe\0Rage\0") : XorStr("Safe\0"));
                            if (g_Globals.AimBot.aimtype == 0)
                                Custom::Combo(XorStr("Target Bone"), &g_Globals.AimBot.Target,
                                    XorStr("Neck\0Legit\0"));
                            if (g_Globals.General.NoAnogs && g_Globals.AimBot.aimtype == 1)
                            {
                                Custom::Combo(XorStr("Aimbot Delay"), &g_Globals.AimBot.PeitosIndex,
                                    XorStr("Peito 0\0Peito 1\0Peito 2\0Peito 3\0Peito 4\0Random\0"));
                                Custom::Checkbox(XorStr("Visible Check"), &g_Globals.AimBot.VisibleCheck);
                                if (g_Globals.AimBot.IgnoreKnocked)
                                {
                                    Custom::Checkbox(XorStr("Puxar Cima"), &g_Globals.AimBot.PraCima);
                                    if (g_Globals.AimBot.PraCima)
                                    {
                                        Custom::SliderFloat(XorStr("Altura"),
                                            &g_Globals.AimBot.PraCimaValor, 0.1f, 1.0f, "%.2f");
                                        Custom::SliderInt(XorStr("Tempo"),
                                            &g_Globals.AimBot.PraCimaTempo, 10, 200, "%d ms");
                                    }
                                }
                            }
                            Custom::Checkbox(XorStr("Ignore Bots"),    &g_Globals.AimBot.IgnoreBots);
                            Custom::Checkbox(XorStr("Ignore Knocked"), &g_Globals.AimBot.IgnoreKnocked);
                            Custom::SliderInt(XorStr("Max Distance"),  &g_Globals.AimBot.MaxDistance, 0, 200, "%d m");
                            Custom::Checkbox(XorStr("Show Fov"),       &g_Globals.Misc.Screen.ShowAimbotFov);
                            Custom::SliderInt(XorStr("Field of View"),  &g_Globals.AimBot.Fov, 0, 360, "%d");
                            if (g_Globals.Misc.Screen.ShowAimbotFov)
                            {
                                Custom::ColorEdit4(XorStr("Fov Color"),        g_Globals.Misc.Screen.AimbotFovColor);
                                Custom::ColorEdit4(XorStr("Fov Filled Color"), g_Globals.Misc.Screen.FilledFovColor);
                            }
                        }
                        Custom::EndCustomChild();
                    }
                    ImGui::EndGroup();
                }
                else if (CurrentTab == 2)
                {
                    ImGui::SetCursorPos(ImVec2(AnimaTab, 0));
                    ImGui::BeginGroup();
                    {
                        Custom::CustomChild(XorStr("Silent Aim"), ImVec2(cardWidth, cardHeight));
                        {
                            Custom::Checkbox(XorStr("Enable Silent"), &g_Globals.Silent.Enabled);
                            Custom::KeyBind(XorStr("SilentKey"), &g_Globals.Silent.KeyBind);
                        }
                        Custom::EndCustomChild();

                        ImGui::SetCursorPos(ImVec2(cardWidth + 10 + AnimaTab, 0));
                        Custom::CustomChild(XorStr("Config"), ImVec2(cardWidth, cardHeight));
                        {
                            Custom::Checkbox(XorStr("Show Fov"), &g_Globals.Misc.Screen.ShowSilentFov);
                            if (g_Globals.Misc.Screen.ShowSilentFov)
                            {
                                Custom::ColorEdit4(XorStr("Fov Color"),        g_Globals.Misc.Screen.SilentFovColor);
                                Custom::ColorEdit4(XorStr("Fov Filled Color"), g_Globals.Misc.Screen.SilentFilledFovColor);
                            }
                            Custom::SliderInt(XorStr("Silent FOV"),      &g_Globals.Silent.Fov, 0, 360, "%d");
                            Custom::SliderInt(XorStr("Silent Distance"), &g_Globals.Silent.MaxDistance, 0, 200, "%d m");
                        }
                        Custom::EndCustomChild();
                    }
                    ImGui::EndGroup();
                }
                else if (CurrentTab == 3)
                {
                    ImGui::SetCursorPos(ImVec2(AnimaTab, 0));
                    ImGui::BeginGroup();
                    {
                        Custom::CustomChild(XorStr("Player Exploits"), ImVec2(cardWidth, cardHeight));
                        {
                            Custom::Checkbox(XorStr("Fast MedKit"),      &g_Globals.Misc.Exploits.LocalPlayer.FastMedkit);
                            Custom::Checkbox(XorStr("Semi Tela Parada"), &g_Globals.Misc.Exploits.LocalPlayer.telaparada);
                            Custom::Checkbox(XorStr("AimLock"),          &g_Globals.Misc.Exploits.LocalPlayer.Aimlock);
                            Custom::Checkbox(XorStr("Max Damage"),       &g_Globals.Misc.Exploits.LocalPlayer.MoreDamage);
                            Custom::Checkbox(XorStr("No Fire Delay"),    &g_Globals.Misc.Exploits.LocalPlayer.FireDelay);
                            Custom::Checkbox(XorStr("Bugar Pixel"),      &g_Globals.Misc.Exploits.LocalPlayer.BugarPixel);
                            Custom::Checkbox(XorStr("Precision"),        &g_Globals.Misc.Exploits.LocalPlayer.Precision);
                            Custom::Checkbox(XorStr("Back Jump"),        &g_Globals.Misc.Exploits.LocalPlayer.BackJump);
                            Custom::Checkbox(XorStr("Soco Longe"),       &g_Globals.Misc.Exploits.LocalPlayer.SocoLonge);
                            Custom::Checkbox(XorStr("Atributar Armas"),  &g_Globals.Misc.Exploits.LocalPlayer.AtributarArma);
                            if (g_Globals.Misc.Exploits.LocalPlayer.AtributarArma)
                                Custom::Combo(XorStr("Level"),
                                    &g_Globals.Misc.Exploits.LocalPlayer.AtributarArmaLevel,
                                    XorStr("Lv 1\0Lv 2\0Lv 3\0Lv 4\0"));
                            if (!g_Globals.General.V31)
                            {
                                Custom::Checkbox(XorStr("Spin Bot"), &g_Globals.Misc.Exploits.LocalPlayer.SpinBot);
                                if (g_Globals.Misc.Exploits.LocalPlayer.SpinBot)
                                    Custom::SliderFloat(XorStr("Spin Speed"),
                                        &g_Globals.Misc.Exploits.LocalPlayer.SpinSpeed, 1.0f, 5.0f, "%.1f");
                            }
                            Custom::Checkbox(XorStr("Ghost"), &g_Globals.AimBot.ghost);
                            Custom::KeyBind(XorStr("GhostKey"), &g_Globals.AimBot.ghostkey);
                        }
                        Custom::EndCustomChild();

                        ImGui::SetCursorPos(ImVec2(cardWidth + 10 + AnimaTab, 0));
                        Custom::CustomChild(XorStr("World Exploits"), ImVec2(cardWidth, cardHeight));
                        {
                            Custom::Checkbox(XorStr("Enable Chams"),    &g_Globals.Visuals.Chams.Enabled);
                            Custom::Checkbox(XorStr("Aggressive Mode"), &g_Globals.Visuals.Chams.AggressiveMode);
                            Custom::ColorEdit4(XorStr("Visible Color"),    g_Globals.Visuals.Chams.NearColor);
                            Custom::ColorEdit4(XorStr("No Visible Color"), g_Globals.Visuals.Chams.FarColor);
                        }
                        Custom::EndCustomChild();
                    }
                    ImGui::EndGroup();
                }
                else if (CurrentTab == 4)
                {
                    ImGui::SetCursorPos(ImVec2(AnimaTab, 0));
                    ImGui::BeginGroup();
                    {
                        Custom::CustomChild(XorStr("General"), ImVec2(cardWidth, cardHeight));
                        {
                            Custom::Checkbox(XorStr("Watermark"), &g_Globals.Visuals.ESP.Watermark);
                            Custom::Checkbox(XorStr("Enemies"),   &g_Globals.Visuals.ESP.Enemy);
                            Custom::Checkbox(XorStr("Weapons"),   &g_Globals.Visuals.ESP.Weapon);
                            if (g_Globals.Visuals.ESP.Weapon)
                                Custom::Combo(XorStr("Style##w"), &g_Globals.Visuals.ESP.WeaponStyle,
                                    XorStr("None\0Text\0Icon\0Both\0"));
                            Custom::Checkbox(XorStr("SnapLines"), &g_Globals.Visuals.ESP.SnapLines);
                            if (g_Globals.Visuals.ESP.SnapLines)
                                Custom::Combo(XorStr("Position##s"), &g_Globals.Visuals.ESP.SnapLinesPos,
                                    XorStr("None\0Top\0Bottom\0"));
                            Custom::Checkbox(XorStr("HealthBar"), &g_Globals.Visuals.ESP.HealthBar);
                            if (g_Globals.Visuals.ESP.HealthBar)
                                Custom::Combo(XorStr("Style##h"), &g_Globals.Visuals.ESP.HealthBarStyle,
                                    XorStr("None\0Left\0Right\0Top\0Bottom\0Text\0"));
                            Custom::Checkbox(XorStr("Box"), &g_Globals.Visuals.ESP.Box);
                            if (g_Globals.Visuals.ESP.Box)
                            {
                                Custom::Combo(XorStr("Box Style##b"), &g_Globals.Visuals.ESP.BoxStyle,
                                    XorStr("None\0Full\0Cornered\0Filled\0"));
                                Custom::Checkbox(XorStr("Box Filled"), &g_Globals.Visuals.ESP.BoxFilled);
                            }
                            Custom::Checkbox(XorStr("Name"),     &g_Globals.Visuals.ESP.ShowName);
                            Custom::Checkbox(XorStr("Distance"), &g_Globals.Visuals.ESP.Distance);
                            Custom::Checkbox(XorStr("Skeleton"), &g_Globals.Visuals.ESP.Skeleton);
                        }
                        Custom::EndCustomChild();

                        ImGui::SetCursorPos(ImVec2(cardWidth + 10 + AnimaTab, 0));
                        Custom::CustomChild(XorStr("Colors"), ImVec2(cardWidth, cardHeight));
                        {
                            Custom::SliderInt(XorStr("Render Distance"), &g_Globals.Visuals.ESP.RenderDistance, 0, 140, "%dm");
                            Custom::SliderFloat(XorStr("Text Size"),  &g_Globals.Visuals.ESP.TextSize,  10.0f, 20.0f, "%.1f");
                            Custom::SliderFloat(XorStr("Thickness"),  &g_Globals.Visuals.ESP.Thickness, 0.1f,  3.0f,  "%.1f");
                            Custom::ColorEdit4(XorStr("Watermark"), g_Globals.Visuals.ESP.WatermarkColor);
                            Custom::ColorEdit4(XorStr("Enemy"),     g_Globals.Visuals.ESP.EnemyColor);
                            Custom::ColorEdit4(XorStr("Weapons"),   g_Globals.Visuals.ESP.WeaponColor);
                            Custom::ColorEdit4(XorStr("SnapLines"), g_Globals.Visuals.ESP.SnapLinesColor);
                            Custom::ColorEdit4(XorStr("Box"),       g_Globals.Visuals.ESP.BoxColor);
                            Custom::ColorEdit4(XorStr("Box Filled"),g_Globals.Visuals.ESP.FilledBoxColor);
                            Custom::ColorEdit4(XorStr("Name"),      g_Globals.Visuals.ESP.NameColor);
                            Custom::ColorEdit4(XorStr("Distance"),  g_Globals.Visuals.ESP.DistanceColor);
                            Custom::ColorEdit4(XorStr("Skeleton"),  g_Globals.Visuals.ESP.SkeletonColor);
                        }
                        Custom::EndCustomChild();
                    }
                    ImGui::EndGroup();
                }
                else if (CurrentTab == 5)
                {
                    ImGui::SetCursorPos(ImVec2(AnimaTab, 0));
                    ImGui::BeginGroup();
                    {
                        Custom::CustomChild(XorStr("General"), ImVec2(cardWidth, cardHeight));
                        {
                            Custom::Checkbox(XorStr("Stream Mode"), &g_Globals.General.CaptureBypass);
                            Custom::SliderInt(XorStr("Frame Rate"), &g_Globals.General.ThreadDelay, 30, 240, "%dFPS");
                            ImGui::Dummy(ImVec2(0, 8));

                            if (Custom::Button(XorStr("Save Config"), ImVec2(ImGui::GetWindowSize().x - 28, 36)))
                            {
                                NotifyManager::Send(
                                    Cheat::Manager::Save() ? XorStr("Config Salva!") : XorStr("Falha ao Salvar Config."),
                                    3000);
                            }
                            ImGui::Dummy(ImVec2(0, 3));
                            if (Custom::Button(XorStr("Load Config"), ImVec2(ImGui::GetWindowSize().x - 28, 36)))
                            {
                                NotifyManager::Send(
                                    Cheat::Manager::Load() ? XorStr("Config Carregada!") : XorStr("Config Inexistente."),
                                    3000);
                            }
                            ImGui::Dummy(ImVec2(0, 3));
                            if (Custom::Button(XorStr("Restart"), ImVec2(ImGui::GetWindowSize().x - 28, 36)))
                            {
                                if (!g_RestartWorkerRunning.exchange(true))
                                {
                                    std::thread([]()
                                    {
                                        try
                                        {
                                            g_FreeFireMemory.Restart();
                                            NotifyManager::Send(XorStr("Restart concluído"), 4000);
                                        }
                                        catch (...)
                                        {
                                            NotifyManager::Send(XorStr("Falha no restart"), 4000);
                                        }
                                        g_RestartWorkerRunning = false;
                                    }).detach();
                                }
                            }
                        }
                        Custom::EndCustomChild();

                        ImGui::SetCursorPos(ImVec2(cardWidth + 10 + AnimaTab, 0));
                        Custom::CustomChild(XorStr("Extra"), ImVec2(cardWidth, cardHeight));
                        {
                            Custom::KeyBind(XorStr("Menu Key"), &g_Globals.General.MenuKey, false);
                            ImGui::Dummy(ImVec2(0, 8));
                            if (Custom::Button(XorStr("Unload"), ImVec2(ImGui::GetWindowSize().x - 28, 36)))
                                g_WantShutdown = true;
                        }
                        Custom::EndCustomChild();
                    }
                    ImGui::EndGroup();
                }
            }
            ImGui::EndChild();
            ImGui::PopStyleVar();
        }
    }
    ImGui::End();
    ImGui::PopStyleVar();
}

void Interface::WindowProc(HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam)
{
    switch (uMsg)
    {
    case WM_SIZE:
        if (wParam != SIZE_MINIMIZED)
        {
            ResizeWidht  = (UINT)LOWORD(lParam);
            ResizeHeight = (UINT)HIWORD(lParam);
            if (ResizeWidht > 0 && ResizeHeight > 0)
                glViewport(0, 0, ResizeWidht, ResizeHeight);
        }
        break;
    }
    if (bIsMenuOpen)
        ImGui_ImplWin32_WndProcHandler(hWnd, uMsg, wParam, lParam);
}

void Interface::HandleMenuKey()
{
    static bool MenuKeyDown = false;
    if (GetAsyncKeyState(g_Globals.General.MenuKey) & 0x8000)
    {
        if (!MenuKeyDown)
        {
            MenuKeyDown = true;
            bIsMenuOpen = !bIsMenuOpen;

            LONG style = GetWindowLong(hWindow, GWL_EXSTYLE);
            if (bIsMenuOpen)
            {
                style &= ~(WS_EX_TRANSPARENT | WS_EX_NOACTIVATE);
                SetWindowLong(hWindow, GWL_EXSTYLE, style);
                SetForegroundWindow(hWindow);
            }
            else
            {
                style |= (WS_EX_TRANSPARENT | WS_EX_NOACTIVATE);
                SetWindowLong(hWindow, GWL_EXSTYLE, style);
                SetForegroundWindow(hTargetWindow);
            }
            SetWindowPos(hWindow, HWND_TOPMOST, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
        }
    }
    else
    {
        MenuKeyDown = false;
    }
}

void Interface::ShutDown()
{
    if (g_InterfaceShuttingDown.exchange(true))
        return;

    Overlay::SetStreamMode(false);

    g_Globals.General.EnableFuncs = false;
    g_Globals.General.ShutDown    = true;
    g_AutoUnloadRequested          = false;
    g_LicenseAuthenticated         = false;

    DiscordRPC::Shutdown();
    StopAutoRestartWorker();

    for (int i = 0; i < 500 && (g_LoginWorkerRunning.load() || g_RestartWorkerRunning.load()); ++i)
        Sleep(10);

    if (g_AvatarTexture != 0)
    {
        glDeleteTextures(1, &g_AvatarTexture);
        g_AvatarTexture = 0;
    }

    Fonts::CleanupTextures();
    ImGui_ImplOpenGL3_Shutdown();
    ImGui_ImplWin32_Shutdown();
    ImGui::DestroyContext();

    // ── Limpa nossa auth ──────────────────────────────────────────────────
    CleanupAuth();
    // ─────────────────────────────────────────────────────────────────────

    Overlay::ShutDown();
}
