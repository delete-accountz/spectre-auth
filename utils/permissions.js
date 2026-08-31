/**
 * Verificador de permissões
 * @module utils/permissions
 */
const { accessRoleId } = require('../config');
const logger = require('./logger');

async function checkPermissions(interaction, command) {
  try {
    if (!interaction.guild) return false;
    const memberLike = interaction.member;
    if (memberLike && memberLike.roles?.cache) {
      return memberLike.roles.cache.has(accessRoleId);
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    return member.roles.cache.has(accessRoleId);
  } catch (error) {
    logger.error(`Erro ao verificar permissões: ${error.stack || error.message}`);
    return false;
  }
}

module.exports = { checkPermissions };
