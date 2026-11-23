/** 三個角色的可玩劇本（11.6），供 api.js 的劇本來源使用 */
import clerk from './script-clerk.js';
import office from './script-office.js';
import vp from './script-vp.js';

export const PLAYABLE_SCRIPTS = Object.freeze({ clerk, office, vp });
