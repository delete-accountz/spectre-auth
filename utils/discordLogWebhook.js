// utils/discordLogWebhook.js
const {
  WebhookClient,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} = require('discord.js');

function buildLogCard({ title, lines }) {
  const c = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${title}**`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  for (const l of lines) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(l));
  return c;
}

function createDiscordLogWebhook() {
  const url = process.env.LOG_WEBHOOK_URL;
  if (!url) return null;
  return new WebhookClient({ url });
}

async function sendDiscordLog(webhook, payload) {
  if (!webhook) return;

  const container = buildLogCard(payload);

  try {
    await webhook.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      withComponents: true,
    });
  } catch (e) {
    await webhook.send({
      content: `**${payload.title}**\n${payload.lines.join('\n')}`.slice(0, 1900),
    });
  }
}

module.exports = { createDiscordLogWebhook, sendDiscordLog };
