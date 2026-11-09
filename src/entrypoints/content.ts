// The content script entry: every frame of every page, from the start of loading.
import { startContent } from '../content/app';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_start',
  main(ctx) {
    startContent(ctx);
  },
});
