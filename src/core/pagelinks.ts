// "]]" / "[[": names of a page's own Next / Previous links. Pure.
export const PAGE_LINK_WORDS: Record<1 | -1, RegExp> = {
  1: /^(next|next page|older|older posts|older entries|more results|load more|›|»|→|>|next ›|next »|next →)$/i,
  [-1]: /^(prev|previous|previous page|newer|newer posts|newer entries|‹|«|←|<|‹ prev|« previous|← previous)$/i,
};
