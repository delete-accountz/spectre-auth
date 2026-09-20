const mongoose = require('mongoose');

const storedFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    filename: { type: String, required: true, trim: true },
    extension: { type: String, required: true, enum: ['dll', 'exe'] },
    size: { type: Number, required: true, min: 0 },
    version: { type: String, default: '1' },
    hash: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

// Index for fast lookups
storedFileSchema.index({ name: 1 });
storedFileSchema.index({ extension: 1 });
storedFileSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StoredFile', storedFileSchema);