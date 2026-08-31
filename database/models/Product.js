const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    productHash: { type: String, default: null, index: true },
    hwidLockEnabled: { type: Boolean, default: true },
    keysCount: { type: Number, default: 0 },
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
