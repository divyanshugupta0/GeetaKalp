---
name: Organic Ethereal
colors:
  surface: '#f4fcee'
  surface-dim: '#d5dccf'
  surface-bright: '#f4fcee'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff6e9'
  surface-container: '#e9f0e3'
  surface-container-high: '#e3eadd'
  surface-container-highest: '#dde5d8'
  on-surface: '#171d15'
  on-surface-variant: '#3e4a3c'
  inverse-surface: '#2b3229'
  inverse-on-surface: '#ecf3e6'
  outline: '#6e7b6a'
  outline-variant: '#bdcab8'
  surface-tint: '#006e1e'
  primary: '#006b1d'
  on-primary: '#ffffff'
  primary-container: '#008727'
  on-primary-container: '#f7fff1'
  inverse-primary: '#66df6c'
  secondary: '#516353'
  on-secondary: '#ffffff'
  secondary-container: '#d4e8d4'
  on-secondary-container: '#576959'
  tertiary: '#aa265b'
  on-tertiary: '#ffffff'
  tertiary-container: '#ca4174'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#83fc86'
  primary-fixed-dim: '#66df6c'
  on-primary-fixed: '#002204'
  on-primary-fixed-variant: '#005315'
  secondary-fixed: '#d4e8d4'
  secondary-fixed-dim: '#b8ccb9'
  on-secondary-fixed: '#0f1f13'
  on-secondary-fixed-variant: '#3a4b3d'
  tertiary-fixed: '#ffd9e1'
  tertiary-fixed-dim: '#ffb1c5'
  on-tertiary-fixed: '#3f001b'
  on-tertiary-fixed-variant: '#8d0846'
  background: '#f4fcee'
  on-background: '#171d15'
  surface-variant: '#dde5d8'
  background-light: '#f6f8f6'
  background-dark: '#112115'
  glass-surface: rgba(255, 255, 255, 0.8)
  glass-border: rgba(255, 255, 255, 1.0)
  divider: rgba(17, 33, 21, 0.1)
typography:
  display-lg:
    fontFamily: Eb Garamond
    fontSize: 36px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.02em
  display-md:
    fontFamily: Eb Garamond
    fontSize: 30px
    fontWeight: '500'
    lineHeight: '1.2'
  display-sm:
    fontFamily: Eb Garamond
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.2'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.1em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1'
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  stack-gap: 32px
  element-gap: 12px
  section-margin: 48px
---

## Brand & Style

Organic Ethereal is a wellness and beauty-focused design system that blends **Minimalism** with **Glassmorphism**. It evokes a sense of "ritual" and "weightlessness," targeting a premium, eco-conscious audience. The aesthetic is characterized by high-key lighting, soft sage greens, and generous whitespace.

The visual language emphasizes transparency and light, using blurred backdrops to create a sense of depth and focus without the need for heavy, opaque containers. It feels like a high-end apothecary—clean, botanical, and intellectual.

## Colors

The palette is rooted in botanical tones. The **Primary Color** (#169c33) is a vibrant sage green used for call-to-action elements, representing life and growth. The **Secondary Color** (#112115) is a deep, near-black "Forest" green used for text and iconography to maintain softer contrast than pure black.

A critical component of this system is the use of semi-transparent whites and light greens for surfaces, allowing background content to filter through softly. This reinforces the "Ethereal" brand promise.

## Typography

The system utilizes a high-contrast typographic pairing:
- **Eb Garamond** (Serif) is the display face. It provides a literary, historical, and premium feel. It should be used for headlines, product names, and large price displays.
- **Plus Jakarta Sans** (Sans-Serif) serves as the functional workhorse. It is soft and modern, ensuring high legibility for body copy, UI controls, and labels.

**Scaling:** On mobile, `display-lg` (36px) is the maximum size allowed to ensure headlines do not break awkwardly.

## Layout & Spacing

Organic Ethereal uses a **Fixed Side-Drawer** model for secondary contexts and a **Fluid Grid** for main content. 

The spacing rhythm is based on a 4px baseline, but defaults to generous gaps to prevent visual clutter. Items in lists (like the shopping cart) should have at least 20px of gap. Large sections should be separated by 32px to 48px to maintain the "airy" feel of the brand.

## Elevation & Depth

This system rejects heavy, dark shadows in favor of **Tonal Layers** and **Glassmorphism**:
- **Level 0 (Base):** The main content background (`#f6f8f6`).
- **Level 1 (Overlay):** A 20% opacity dark wash (`#11211533`) with a `blur(4px)` to isolate the UI foreground.
- **Level 2 (Surface):** Semi-transparent white (`rgba(255, 255, 255, 0.8)`) with a `backdrop-filter: blur(12px)`.
- **Accents:** Use extremely soft, low-opacity shadows (`shadow-sm`) only for circular image containers to give them a subtle lift from the background.

## Shapes

The shape language is strictly **Pill-shaped** and **Circular**. 
- Buttons, input fields, and quantity selectors must use `rounded-full`.
- Product image containers are perfectly circular to contrast with the rectangular nature of the screen.
- Larger containers (like the drawer itself) use a `rounded-l-3xl` (approx 32px) on mobile or side-anchored views.
- Sharp corners are prohibited as they conflict with the "organic" brand values.

## Components

### Buttons
Primary buttons use the Green (#169c33) fill with White text, `rounded-full` shape, and `uppercase tracking-widest` labels. 

### Quantity Selectors
Small pill-shaped containers with a light border (`forest/20%`). Icon buttons inside should be circular and provide a subtle hover state (`forest/5%`).

### Images
Product images are always contained within a circular frame with a subtle 1px border (`forest/5%`) to define the edge against light backgrounds.

### Drawers/Modals
Should always utilize `backdrop-blur-md` and a white semi-transparent background to maintain the ethereal aesthetic. The left border should be a solid white or extremely light green to simulate a "glint" of light on glass.

### Icons
Use Material Symbols (Outlined) with a weight of 300-400. Icons should be sized at 20px or 24px and inherit the Secondary Color at 60% opacity for inactive states.