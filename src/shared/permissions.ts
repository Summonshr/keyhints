// Bookmarks and history: optional permissions, asked for on a click (settings, welcome page), never
// at install. With them, the palette searches bookmarks and history too.
export const SEARCH_PERMISSIONS: chrome.permissions.Permissions = { permissions: ['bookmarks', 'history'] };

export const searchAllowed = (): Promise<boolean> => chrome.permissions.contains(SEARCH_PERMISSIONS);
export const allowSearch = (): Promise<boolean> => chrome.permissions.request(SEARCH_PERMISSIONS);
export const stopSearch = (): Promise<boolean> => chrome.permissions.remove(SEARCH_PERMISSIONS);
