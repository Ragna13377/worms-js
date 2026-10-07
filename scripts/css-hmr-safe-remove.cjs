// Next's CSS HMR can remove a link twice when stylesheet requests overlap.
// Element.remove() is idempotent, including when the link is already detached.
module.exports = (source) => source.replace(/(\w+)\.parentNode\.removeChild\(\1\)/g, '$1.remove()');
