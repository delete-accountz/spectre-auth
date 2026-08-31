const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },

    // qual licença será renovada (obrigatório no endpoint de renew)
    licenseKey: { type: mongoose.Schema.Types.ObjectId, ref: "Key", default: null, index: true },

    provider: { type: String, enum: ["EFIPAY"], default: "EFIPAY", index: true },

    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "BRL", maxlength: 8 },

    status: {
      type: String,
      enum: ["PENDING", "PAID", "CANCELED", "EXPIRED", "FAILED", "REFUNDED"],
      default: "PENDING",
      index: true,
    },

    efi: {
      chargeId: { type: Number, default: null },
      notificationToken: { type: String, default: null, maxlength: 120 },
      paymentUrl: { type: String, default: "", maxlength: 600 },
      lastStatus: { type: String, default: "", maxlength: 32 },
    },

    paidAt: { type: Date, default: null },

    meta: { type: Object, default: {} },
  },
  { timestamps: true, minimize: true }
);

orderSchema.index({ "efi.chargeId": 1 }, { sparse: true });

orderSchema.set("toJSON", { versionKey: false });

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);
