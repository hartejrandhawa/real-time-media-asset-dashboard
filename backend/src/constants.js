// Single source of truth for enumerated values the API validates against.
const ROLES = ['admin', 'editor', 'viewer'];
const ASSET_TYPES = ['video', 'audio', 'image', 'document'];
const STATUSES = ['pending', 'processing', 'ready', 'failed', 'archived'];

module.exports = { ROLES, ASSET_TYPES, STATUSES };
