# Development counterexamples

These are automated development runs, not human observations or difficulty estimates. They are retained as negative findings rather than counted among the final passing release runs.

- `attack-only-controller.json`, screenshot and trace: a carried-route controller lost while pursuing the courier instead of defending against nearby guards. The final controller can use a decoy and shoot a nearby guard before continuing interception. Production robot behavior was not disabled to obtain a win.
- `firefox-budget-*`: a second controller stopped after 180 interception decisions while still alive, with 53.68 game seconds left and a stunned courier still holding its parcel. Its test failed the pickup assertion. The controller now has a larger decision budget within the unchanged 75-second round. This is not a parcel authorization or game-win failure.

Manual-input integration tests now freeze scheduling before the first simulation tick so browser loading speed cannot consume an arbitrary prefix of a scripted test. Every actor still runs during supplied game inputs. Separate tests exercise actual keyboard/touch input and the production build. The traces describe intermediate, uncommitted development states; they must not be labeled final-release results. Historical v0.2 cross-engine negative evidence remains in its original directory.
