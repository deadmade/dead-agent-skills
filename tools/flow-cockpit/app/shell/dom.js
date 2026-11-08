/**
 * An element with a class and children; a child that is `undefined` is skipped.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {string} [className] @param {...(Node | string | undefined)} kids
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, className = '', ...kids) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...kids.filter((kid) => kid !== undefined));
  return node;
}
