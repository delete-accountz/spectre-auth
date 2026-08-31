using Safety;
using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Security.Cryptography;

namespace Spoofer
{
    public partial class Form2 : Form
    {
        private const string BASE_URL = "https://YOUR-API-URL.railway.app/";
        private readonly SafetyAPI _api;

        public Form2()
        {
            InitializeComponent();
            _api = new SafetyAPI(BASE_URL);
        }

        private async Task InitializeSafetyAPI()
        {
            try
            {
                var init = await _api.InitAsync();
                if (!init.Success)
                {
                    SafetyAPI.Fatal("api offline -> " + (init.Message ?? "no response"));
                    Application.Exit();
                }
            }
            catch (Exception ex)
            {
                SafetyAPI.Fatal("critical init error -> " + ex.Message);
                Application.Exit();
            }
        }

        // -----------------------------------------------
        // Armazena credenciais localmente com DPAPI
        // -----------------------------------------------
        internal static class RememberMeStore
        {
            private static readonly string Folder   = @"C:\Safety";
            private static readonly string FilePath = System.IO.Path.Combine(Folder, "user.dat");

            public static void Save(string username, string password)
            {
                Directory.CreateDirectory(Folder);
                var plain = $"{username}|{password}";
                var bytes = System.Text.Encoding.UTF8.GetBytes(plain);
                var protectedBytes = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(FilePath, protectedBytes);
            }

            public static bool TryLoad(out string username, out string password)
            {
                username = "";
                password = "";
                if (!File.Exists(FilePath)) return false;
                try
                {
                    var protectedBytes = File.ReadAllBytes(FilePath);
                    var bytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
                    var plain = System.Text.Encoding.UTF8.GetString(bytes);
                    var parts = plain.Split(new[] { '|' }, 2);
                    if (parts.Length != 2) return false;
                    username = parts[0];
                    password = parts[1];
                    return true;
                }
                catch { return false; }
            }

            public static void Delete()
            {
                if (File.Exists(FilePath)) File.Delete(FilePath);
            }
        }

        // -----------------------------------------------
        // Load — preenche campos se "lembrar" estiver ativo
        // -----------------------------------------------
        private async void Form2_Load(object sender, EventArgs e)
        {
            await InitializeSafetyAPI();
            if (RememberMeStore.TryLoad(out var savedUser, out var savedPass))
            {
                // txtUsername e txtPassword são os nomes dos TextBox no Designer
                txtUsername.Text = savedUser;
                txtPassword.Text = savedPass;
                chkRemember.Checked = true;
            }
        }

        // -----------------------------------------------
        // Botão Login
        // -----------------------------------------------
        private async void btnLogin_Click(object sender, EventArgs e)
        {
            string username = txtUsername.Text.Trim();
            string password = txtPassword.Text;

            if (string.IsNullOrWhiteSpace(username))
            {
                MessageBox.Show("validation error -> username required", "Login",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (string.IsNullOrWhiteSpace(password))
            {
                MessageBox.Show("validation error -> password required", "Login",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                var result = await _api.LoginAsync(username, password);
                if (!result.Success)
                {
                    MessageBox.Show("login failed -> " + (result.Message ?? "unknown error"), "Login",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                var session = SessionInfo.Create(username, result.ExpiresAt);

                if (chkRemember.Checked)
                    RememberMeStore.Save(username, password);
                else
                    RememberMeStore.Delete();

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
