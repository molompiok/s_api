import env from "#start/env";

export const EXT_IMAGE = ['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'avif', 'apng', 'gif', "jpg", "png", "jpeg", "webp"]
export const EXT_VIDEO  = ['webm', 'mp4', 'mov', 'avi', 'wmv', 'avchd', 'mkv', 'flv', 'mxf', 'mts', 'm2ts', '3gp', 'ogv']
export const MEGA_OCTET = 1024 * 1024;

export const OWNER_ID = env.get('OWNER_ID')
export const THEME_ID = env.get('THEME_ID')
export const STORE_ID = env.get('STORE_ID')
export const STORE_NAME = env.get('STORE_NAME')
export const GOOGLE_CLIENT_ID = env.get('GOOGLE_CLIENT_ID')


