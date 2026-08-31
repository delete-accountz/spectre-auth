const mongoose = require('mongoose');

const configSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    version: { type: String, required: true },
    downloadLink: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Config', configSchema);
