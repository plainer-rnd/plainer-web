// Tiny DOM builder. Text always goes through textContent, so trip names and other user data
// can never be interpreted as HTML.
export function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attributes).forEach(([name, value]) => {
    if (value === false || value === null || value === undefined) return;
    if (name === 'class') node.className = value;
    else if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value === true ? '' : value);
  });
  [].concat(children).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child);
  });
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(markup) {
  const wrapper = document.createElementNS(SVG_NS, 'svg');
  wrapper.innerHTML = markup;
  return wrapper;
}
