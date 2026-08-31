using System;

namespace Safety
{
    public sealed class SessionInfo
    {
        public string Username    { get; private set; }
        public string DisplayName { get; private set; }
        public string AvatarUrl   { get; private set; }
        public string ProductHash { get; private set; }
        public DateTime? ExpiresAt { get; private set; }

        private SessionInfo() { }

        public static SessionInfo Create(
            string username,
            DateTime? expiresAt,
            string displayName = null,
            string avatarUrl   = null,
            string productHash = null)
        {
            return new SessionInfo
            {
                Username    = username ?? string.Empty,
                DisplayName = displayName ?? username ?? string.Empty,
                AvatarUrl   = avatarUrl ?? string.Empty,
                ExpiresAt   = expiresAt,
                ProductHash = productHash ?? string.Empty,
            };
        }
    }
}
