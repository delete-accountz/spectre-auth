const mongoose = require("mongoose");

const DISCORD_ID_REGEX = /^\d{17,19}$/;

const ticketMessageSchema = new mongoose.Schema(
  {
    by: { type: String, enum: ["client", "staff"], required: true },
    authorDiscordId: {
      type: String,
      default: null,
      validate: {
        validator: (v) => v === null || DISCORD_ID_REGEX.test(String(v)),
        message: "Invalid authorDiscordId",
      },
    },
    content: { type: String, required: true, trim: true, maxlength: 900 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["HWID_RESET", "SUPPORT"], required: true, index: true },
    status: { type: String, enum: ["open", "in_progress", "closed"], default: "open", index: true },

    discordId: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: (v) => DISCORD_ID_REGEX.test(String(v)),
        message: "Invalid discordId",
      },
    },

    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null, index: true },

    licenseKeyMasked: { type: String, default: null, maxlength: 120 },

    messages: { type: [ticketMessageSchema], default: [] },
  },
  { timestamps: true, minimize: true }
);

ticketSchema.index({ discordId: 1, status: 1, type: 1, createdAt: -1 });

ticketSchema.set("toJSON", { versionKey: false });

module.exports = mongoose.models.Ticket || mongoose.model("Ticket", ticketSchema);
