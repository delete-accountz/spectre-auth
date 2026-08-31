const mongoose = require('mongoose');

const AppSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppSetting', AppSettingSchema);
