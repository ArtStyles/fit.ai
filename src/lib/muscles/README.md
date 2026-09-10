# Anatomical geometry

`geometry.json` is mechanically converted from the original **MuscleMap** male front/back path tables by Melih Colpan, MIT licensed, pinned to commit `7dc03071e03052e8bd4f6351e9176994cd28aa7d`.

Source: https://github.com/melihcolpan/MuscleMap/tree/7dc03071e03052e8bd4f6351e9176994cd28aa7d

License shipped at `public/third-party/MuscleMap-LICENSE.txt`, copied to the Android bundle by `scripts/prepare-mobile.mjs`. No openGym code or derivative path file was used.

Regenerate with `node scripts/import-muscle-map.mjs <directory-with-original-Swift-files-and-LICENSE>`. Overlapping subgroups are excluded; original path coordinates and front/back viewBoxes are retained. The app groups geometry for presentation; counts indicate catalogued muscle involvement, not measured individual muscle activation, recovery, or medical advice.

The existing trapezius, lower-back, neck and tibialis paths represent separate activity groups. Upper-back paths retain the general back group. Head, hair, hands, knees, ankles and feet remain decorative. Rotator-cuff and anconeus activity is available in the group list and exercise breakdown, with a note when it contributes sets, because this source has no dedicated geometry for those muscles. Do not repurpose neighboring paths to suggest a region is drawn when it is not.
