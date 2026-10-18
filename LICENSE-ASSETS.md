# Licences of the artwork and game data

Sidekick for Habitica's code is under the GNU General Public License version 3 only (`LICENSE`). The engine in `src/engine/` is a port of [Habitica](https://github.com/HabitRPG/habitica)'s code, which is GPL v3.

Habitica's artwork and content are **not** under the GPL. They are © HabitRPG, Inc., under [Creative Commons Attribution-NonCommercial-ShareAlike 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/), and they stay under that licence here:

- `public/stable/` and `public/shop/`: pet, mount, item and skill pictures from [habitica-images](https://github.com/HabitRPG/habitica-images), cropped and re-encoded (pixels unchanged). The bosses' pictures are reduced to outlines and the collection quests' finds are packed into one sheet.
- `src/data/`: item, skill, pet and quest data generated from Habitica's content.
- Pictures the app makes from them, such as the Stable postcard and the avatar.

Because of the NonCommercial term, the app is free and non-commercial: no price, no ads, no paid tier.

Sidekick for Habitica isn't affiliated with or endorsed by Habitica or HabitRPG, Inc.

The app icon (`tools/app-icon/`, the launcher layers in `android/app/src/main/res/drawable/ic_launcher_*.xml` and `public/icons/`) was drawn for this app, not taken from Habitica, and is GPL-3.0-only with the code.

Also bundled:
- Material Icons © Google, Apache License 2.0.
- Roboto and Nunito, SIL Open Font License 1.1.
- fdlibm's sine © 1993 Sun Microsystems, redistributable with its notice (`src/engine/fdlibm.ts`).
