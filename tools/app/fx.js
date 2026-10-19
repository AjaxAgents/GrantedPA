// A small builder for Power Apps canvas source (.fx.yaml, the format `pac canvas pack` reads).
// Controls are plain objects; yaml() writes them out. Classic controls only.
'use strict';

const C = {
  blue: 'ColorValue("#0133A2")', navy: 'ColorValue("#0A1F52")', ink: 'ColorValue("#172033")', muted: 'ColorValue("#5A6478")',
  line: 'ColorValue("#DCE2EC")', field: 'ColorValue("#F1F3F6")', paper: 'ColorValue("#E6EAEF")', white: 'Color.White',
  go: 'ColorValue("#12804A")', stop: 'ColorValue("#C2252D")', hold: 'ColorValue("#946200")', goSoft: 'ColorValue("#E3F4EA")',
  stopSoft: 'ColorValue("#FBE7E3")', holdSoft: 'ColorValue("#FDF3DC")', blueSoft: 'ColorValue("#E8EEFB")', clear: 'Color.Transparent',
};
const W = 640; // phone layout width
const M = 24;  // side margin
const FW = W - 2 * M;

/** Power Fx string literal. */
const s = (text) => '"' + String(text).replace(/"/g, '""') + '"';

function ctl(name, type, props, children) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new Error('bad control name ' + name);
  return { name, type, props: props || {}, children: children || [] };
}

// ------------------------------------------------------------------ controls
const base = (p) => Object.assign({}, p);
function label(name, p) {
  return ctl(name, 'label', base({
    Text: p.text, X: p.x ?? M, Y: p.y ?? 0, Width: p.w ?? FW, Height: p.h ?? 40, Size: p.size ?? 14,
    Color: p.color ?? C.ink, FontWeight: p.bold ? 'FontWeight.Semibold' : (p.weight ?? 'FontWeight.Normal'),
    Fill: p.fill, Align: p.align, VerticalAlign: p.valign ?? 'VerticalAlign.Middle', Visible: p.visible,
    AutoHeight: p.autoHeight ? 'true' : undefined, PaddingLeft: p.padL ?? 0, PaddingRight: p.padR ?? 0, PaddingTop: p.padT, PaddingBottom: p.padB,
    OnSelect: p.onSelect, Font: p.mono ? 'Font.\'Courier New\'' : undefined, Italic: p.italic ? 'true' : undefined,
    BorderColor: p.border, BorderThickness: p.border ? 1 : undefined, Wrap: p.wrap === false ? 'false' : undefined,
  }));
}
function button(name, p) {
  const primary = p.kind !== 'secondary' && p.kind !== 'danger' && p.kind !== 'go';
  const fill = p.fill ?? (p.kind === 'secondary' ? C.white : p.kind === 'danger' ? C.stop : p.kind === 'go' ? C.go : C.blue);
  const color = p.color ?? (p.kind === 'secondary' ? C.blue : C.white);
  return ctl(name, 'button', base({
    Text: p.text, X: p.x ?? M, Y: p.y ?? 0, Width: p.w ?? FW, Height: p.h ?? 56, Size: p.size ?? 14, OnSelect: p.onSelect,
    Fill: fill, Color: color, HoverFill: `ColorFade(${fill}, -10%)`, PressedFill: `ColorFade(${fill}, -20%)`, HoverColor: color, PressedColor: color,
    BorderColor: p.kind === 'secondary' ? C.blue : fill, BorderThickness: p.kind === 'secondary' ? 2 : 0,
    RadiusTopLeft: 10, RadiusTopRight: 10, RadiusBottomLeft: 10, RadiusBottomRight: 10, FontWeight: 'FontWeight.Semibold',
    DisplayMode: p.displayMode, Visible: p.visible, DisabledFill: 'ColorValue("#B8C2D6")', DisabledColor: C.white, DisabledBorderColor: 'ColorValue("#B8C2D6")',
    AccessibleLabel: p.a11y, Align: p.align,
  }));
}
function input(name, p) {
  return ctl(name, 'text', base({
    Default: p.default ?? '""', HintText: p.hint ? s(p.hint) : undefined, X: p.x ?? M, Y: p.y ?? 0, Width: p.w ?? FW, Height: p.h ?? 52, Size: 14,
    Mode: p.multiline ? 'TextMode.MultiLine' : undefined, Format: p.number ? 'TextFormat.Number' : undefined, Fill: C.field, BorderColor: C.line,
    HoverBorderColor: C.blue, FocusedBorderColor: C.blue, RadiusTopLeft: 8, RadiusTopRight: 8, RadiusBottomLeft: 8, RadiusBottomRight: 8,
    PaddingLeft: 12, Visible: p.visible, DisplayMode: p.displayMode, OnChange: p.onChange, DelayOutput: p.delay ? 'true' : undefined,
    AccessibleLabel: p.a11y ? s(p.a11y) : (p.hint ? s(p.hint) : undefined), MaxLength: p.max,
  }));
}
function dropdown(name, p) {
  return ctl(name, 'dropdown', base({
    Items: p.items, Default: p.default, X: p.x ?? M, Y: p.y ?? 0, Width: p.w ?? FW, Height: p.h ?? 52, Size: 14, Fill: C.field,
    BorderColor: C.line, ChevronBackground: C.field, ChevronFill: C.blue, OnChange: p.onChange, Visible: p.visible, AllowEmptySelection: p.allowEmpty ? 'true' : undefined,
    AccessibleLabel: p.a11y ? s(p.a11y) : undefined, DisplayMode: p.displayMode,
  }));
}
function datepicker(name, p) {
  return ctl(name, 'datepicker', base({
    DefaultDate: p.default, X: p.x ?? M, Y: p.y ?? 0, Width: p.w ?? FW, Height: p.h ?? 52, Size: 14, Fill: C.field, BorderColor: C.line,
    IconBackground: C.blue, Format: 'DateTimeFormat.LongDate', OnChange: p.onChange, Visible: p.visible, StartYear: 'Year(Today())', EndYear: 'Year(Today()) + 2',
    AccessibleLabel: p.a11y ? s(p.a11y) : undefined,
  }));
}
function toggle(name, p) {
  return ctl(name, 'toggleSwitch', base({
    Default: p.default ?? 'false', X: p.x ?? M, Y: p.y ?? 0, Width: p.w ?? 120, Height: p.h ?? 48, OnCheck: p.onCheck, OnUncheck: p.onUncheck,
    TrueFill: C.blue, Visible: p.visible, TrueText: '"On"', FalseText: '"Off"', AccessibleLabel: p.a11y ? s(p.a11y) : undefined,
  }));
}
function checkbox(name, p) {
  return ctl(name, 'checkbox', base({ Text: p.text, Default: p.default ?? 'false', X: p.x ?? M, Y: p.y ?? 0, Width: p.w ?? FW, Height: p.h ?? 48, Size: 13, CheckmarkFill: C.white, CheckboxBackgroundFill: C.blue, Visible: p.visible }));
}
function rect(name, p) {
  return ctl(name, 'rectangle', base({ X: p.x ?? 0, Y: p.y ?? 0, Width: p.w ?? W, Height: p.h ?? 1, Fill: p.fill ?? C.line, Visible: p.visible, OnSelect: p.onSelect, BorderColor: p.border, BorderThickness: p.border ? 1 : undefined }));
}
function image(name, p) {
  return ctl(name, 'image', base({ Image: p.image, X: p.x ?? M, Y: p.y ?? 0, Width: p.w ?? 100, Height: p.h ?? 100, Visible: p.visible, ImagePosition: 'ImagePosition.Fit', AccessibleLabel: p.a11y ? s(p.a11y) : undefined, Fill: p.fill }));
}
function html(name, p) {
  return ctl(name, 'htmlViewer', base({ HtmlText: p.html, X: p.x ?? M, Y: p.y ?? 0, Width: p.w ?? FW, Height: p.h ?? 100, Visible: p.visible, Size: 12, AutoHeight: p.autoHeight ? 'true' : undefined }));
}
function timer(name, p) {
  return ctl(name, 'timer', base({ Duration: p.duration, Repeat: p.repeat ? 'true' : 'false', AutoStart: p.autoStart ?? 'true', OnTimerEnd: p.onEnd, Visible: 'false', X: 0, Y: 0, Width: 10, Height: 10, Start: p.start }));
}
function gallery(name, p, children) {
  const variant = p.variant ?? (p.flexible ? 'variableTemplateHeightGallery' : 'galleryVertical');
  return ctl(name, 'gallery.' + variant, base({
    Items: p.items, X: p.x ?? 0, Y: p.y ?? 0, Width: p.w ?? W, Height: p.h ?? 400, TemplateSize: p.size ?? 90, TemplatePadding: p.pad ?? 0,
    Layout: variant === 'galleryHorizontal' ? 'Layout.Horizontal' : 'Layout.Vertical', ShowScrollbar: 'false', Visible: p.visible,
    OnSelect: p.onSelect, WrapCount: p.wrap, AccessibleLabel: p.a11y ? s(p.a11y) : undefined, TemplateFill: p.templateFill,
  }), children);
}
function icon(name, p, glyph) {
  return ctl(name, 'icon.' + glyph, base({ X: p.x, Y: p.y, Width: p.w ?? 48, Height: p.h ?? 48, Color: p.color ?? C.white, OnSelect: p.onSelect, Visible: p.visible, PaddingTop: 10, PaddingBottom: 10, PaddingLeft: 10, PaddingRight: 10, AccessibleLabel: p.a11y ? s(p.a11y) : undefined, Tooltip: p.a11y ? s(p.a11y) : undefined }));
}
function screen(name, p, children) {
  return ctl(name, 'screen', base({ Fill: p.fill ?? C.paper, OnVisible: p.onVisible, LoadingSpinnerColor: C.blue }), children);
}

// ------------------------------------------------------------------ YAML writer
function needsBlock(f) { return /\n|#|: |^\s|\s$|^[|>'"]/.test(f) || f.includes('\t'); }
function yaml(c, depth = 0) {
  const ind = '    '.repeat(depth);
  const lines = [`${ind}${c.name} As ${c.type}:`];
  const keys = Object.keys(c.props).filter((k) => c.props[k] !== undefined && c.props[k] !== null).sort();
  for (const k of keys) {
    const f = String(c.props[k]);
    if (needsBlock(f)) {
      lines.push(`${ind}    ${k}: |-`);
      f.split('\n').forEach((l, i) => lines.push(`${ind}        ${i === 0 ? '=' : ''}${l}`));
    } else lines.push(`${ind}    ${k}: =${f}`);
  }
  for (const ch of c.children) { lines.push(''); lines.push(...yaml(ch, depth + 1)); }
  return depth === 0 ? lines.join('\n') + '\n' : lines;
}

/** Every formula in a control tree, for checking: [controlName, property, formula]. */
function formulas(c, out = []) {
  for (const [k, v] of Object.entries(c.props)) if (v !== undefined && v !== null) out.push([c.name, k, String(v)]);
  c.children.forEach((ch) => formulas(ch, out));
  return out;
}

module.exports = { C, W, M, FW, s, ctl, label, button, input, dropdown, datepicker, toggle, checkbox, rect, image, html, timer, gallery, icon, screen, yaml, formulas };
