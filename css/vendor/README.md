# Vendored: CMS web theme

`cambridge-tokens.css` is the framework-agnostic build of
[cms-cambridge/cms-web-theme](https://github.com/cms-cambridge/cms-web-theme), and `../../js/vendor/cambridge-theme.js` is its
optional light/dark toggle. Both are copied unchanged from commit `88dc00c` (MIT, see `cms-web-theme-LICENSE`). They supply the
`--cam-*` tokens, the `.cam-*` components and dark mode this app uses.

To update: copy the new `css/cambridge-tokens.css` and `js/cambridge-theme.js` over these, run `npm test` (it fails if the app
uses a token or class the theme no longer has), and check the app in the browser in both light and dark. Do not edit the copies:
the app's own rules live in `../style.css`, and the typefaces the theme asks for are self-hosted in `../fonts.css`.
