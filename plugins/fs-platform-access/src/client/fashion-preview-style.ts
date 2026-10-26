export const fashionPreviewCss=`
.fs-fashion-gallery{margin:16px 0;color:var(--text-primary);container-type:inline-size}
.fs-fashion-gallery__head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}
.fs-fashion-gallery__head h3{margin:0;font-size:14px;font-weight:600}
.fs-fashion-gallery__head span{font-size:12px;color:var(--text-tertiary)}
.fs-fashion-gallery__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:12px}
.fs-fashion-result{min-width:0}
.fs-fashion-card{margin:0;height:100%;min-width:0}
.fs-fashion-card__media{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:4/5;background:var(--bg-tertiary);border:0;padding:8px;box-sizing:border-box;cursor:zoom-in}
.fs-fashion-card__media img{display:block;width:100%;height:100%;object-fit:contain}
.fs-fashion-card__media p{font-size:12px;color:var(--text-secondary);padding:16px;text-align:center}
.fs-fashion-card__meta{font-size:12px;color:var(--text-tertiary);margin:10px 0 0;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.fs-fashion-action{flex:1}
.fs-fashion-card__media:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}
.fs-fashion-card__media:disabled{cursor:default}
.fs-fashion-card__note{font-size:12px;color:var(--text-secondary);margin:0;overflow-wrap:anywhere}
.fs-fashion-card__error{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.fs-fashion-dialog{width:min(960px,92vw);max-height:90vh;box-sizing:border-box;padding:16px;border:1px solid var(--border-default);border-radius:12px;background:var(--bg-elevated);color:var(--text-primary)}
.fs-fashion-dialog::backdrop{background:var(--fs-shadow)}
.fs-fashion-dialog__head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:16px}
.fs-fashion-dialog__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.fs-fashion-dialog__grid--single{grid-template-columns:1fr}
.fs-fashion-dialog figure{margin:0;min-width:0}
.fs-fashion-dialog figcaption{font-size:12px;color:var(--text-secondary);margin:0 0 8px}
.fs-fashion-dialog img{display:block;width:100%;height:min(62vh,650px);object-fit:contain;background:var(--bg-tertiary)}
.fs-fashion-dialog__note{font-size:12px;color:var(--text-secondary);margin-bottom:0}
@container(max-width:560px){.fs-fashion-gallery__grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fs-fashion-action{min-height:44px;flex-basis:100%}.fs-fashion-gallery__head{align-items:flex-start;flex-direction:column;gap:4px}}
@container(max-width:360px){.fs-fashion-gallery__grid{grid-template-columns:1fr}}
@media(max-width:560px){.fs-fashion-dialog__grid{grid-template-columns:1fr}.fs-fashion-dialog img{height:38vh}}
`
