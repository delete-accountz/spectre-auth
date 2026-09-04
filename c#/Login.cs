using Spectre;
using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Security.Cryptography;

namespace Spoofer
{
    public partial class Form2 : Form
    {
        private const string BASE_URL = "https://spectre-auth-production-13a2.up.railway.app";
        private const string PRODUCT_HASH = "";
        
        private readonly SpectreAuth _api;

        public Form2()
        {
            InitializeComponent();
            _api = new SpectreAuth(BASE_URL, 15, PRODUCT_HASH);
        }

        private async Task InitializeSpectreAuth()
        {
            try
            {
                var init = await _api.InitAsync();
                if (!init.Success)
                {
                    SpectreAuth.Fatal("api offline -> " + (init.Message ?? "no response"));
                    Application.Exit();
                }
            }
            catch (Exception ex)
            {
                SpectreAuth.Fatal("critical init error -> " + ex.Message);
                Application.Exit();
            }
        }

        // -----------------------------------------------
        // Armazena license key localmente com DPAPI
        // -----------------------------------------------
        internal static class RememberMeStore
        {
            private static readonly string Folder = @"C:\SpectreAuth";
            private static readonly string FilePath = System.IO.Path.Combine(Folder, "license.dat");

            public static void Save(string licenseKey)
            {
                Directory.CreateDirectory(Folder);
                var plain = licenseKey;
                var bytes = System.Text.Encoding.UTF8.GetBytes(plain);
                var protectedBytes = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(FilePath, protectedBytes);
            }

            public static bool TryLoad(out string licenseKey)
            {
                licenseKey = "";
                if (!File.Exists(FilePath)) return false;
                try
                {
                    var protectedBytes = File.ReadAllBytes(FilePath);
                    var bytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
                    licenseKey = System.Text.Encoding.UTF8.GetString(bytes);
                    return !string.IsNullOrWhiteSpace(licenseKey);
                }
                catch { return false; }
            }

            public static void Delete()
            {
                if (File.Exists(FilePath)) File.Delete(FilePath);
            }
        }

        // -----------------------------------------------
        // Load — preenche campo se "lembrar" estiver ativo
        // -----------------------------------------------
        private async void Form2_Load(object sender, EventArgs e)
        {
            await InitializeSpectreAuth();
            
            if (RememberMeStore.TryLoad(out var savedKey))
            {
                txtLicenseKey.Text = savedKey;
                chkRemember.Checked = true;
            }
        }

        // -----------------------------------------------
        // Botão Login
        // -----------------------------------------------
        private async void btnLogin_Click(object sender, EventArgs e)
        {
            string licenseKey = txtLicenseKey.Text.Trim();

            if (string.IsNullOrWhiteSpace(licenseKey))
            {
                MessageBox.Show("validation error -> license key required", "Login",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                var result = await _api.LoginAsync(licenseKey);

                if (!result.Success)
                {
                    MessageBox.Show("login failed -> " + (result.Message ?? "unknown error"), "Login",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                if (chkRemember.Checked)
                    RememberMeStore.Save(licenseKey);
                else
                    RememberMeStore.Delete();

                var session = SessionInfo.Create(
                    licenseKey, 
                    result.ExpiresAt,
                    displayName: result.ProductName
                );

                Form1 main = new Form1(session);
                main.StartPosition = FormStartPosition.Manual;
                main.Location = this.Location;
                main.Show();
                this.Hide();
            }
            catch (Exception ex)
            {
                MessageBox.Show("internal error -> " + ex.Message, "Login",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}