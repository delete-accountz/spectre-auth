const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, minlength: 20, maxlength: 600 },
    displayName: { type: String, default: null, maxlength: 80 },
    role: { type: String, enum: ['OWNER', 'SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'VIEWER'], default: 'ADMIN', index: true },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', index: true },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: String, default: null },
  },
  { timestamps: true, minimize: true }
);

adminUserSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.models.AdminUser || mongoose.model('AdminUser', adminUserSchema);
