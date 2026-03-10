# SNAKE by CHRIS GOYETTE

![Status](https://img.shields.io/badge/Status-Stable-79f2c0?style=for-the-badge)
![Language](https://img.shields.io/badge/Language-Python-3b82f6?style=for-the-badge)
![UI](https://img.shields.io/badge/UI-Tkinter-0b1020?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-v1.0.0-ffeb3b?style=for-the-badge)

A polished retro-style Snake game built in Python with Tkinter, featuring a classic arcade loop, persistent top scores, high-score celebrations, and a custom themed UI.

---

## Overview

This project is a desktop Snake game focused on:

- deterministic game logic
- smooth keyboard-first gameplay
- retro visual style
- persistent leaderboard and high score data
- polished UX touches (start screen, game-over transitions, hover states)

---

## Built With

- Python 3.x
- Tkinter (standard library GUI)
- `unittest` for core logic coverage

No third-party runtime dependencies are required.

---

## Features

- Classic Snake mechanics:
  - grid-based movement
  - food spawning
  - growth and score progression
  - collision-based game over
- Retro start screen with blinking prompt
- Top 5 leaderboard with username capture
- Duplicate-name handling (keeps each player's best score)
- New high-score celebration effects
- Animated game-over transition before returning to start screen
- Keyboard controls:
  - arrows
  - `W/A/S/D`
  - `Enter` to start
  - `Space` to pause
  - `Esc` to quit
- Single-instance lock to prevent duplicate game windows

---

## Controls

| Action | Keys |
|---|---|
| Move | Arrow keys or `W/A/S/D` |
| Start game | `Enter` or `Start` button |
| Pause / Resume | `Space` or `Pause` button |
| Restart run | `Restart` button |
| Reset leaderboard | `Reset Scores` button |
| Exit game | `Esc` or window close |

---

## Project Structure

```text
snake_game/
  assets/
    snake-game-custom.ico
  src/
    snake_logic.py
    snake_game_tkinter.py
  tests/
    test_snake_logic.py
  run_game.py
  Launch Snake Game.bat
  Launch Snake Game.vbs
  README.md
```

---

## Run Locally

```powershell
cd "C:\Users\goyette\Desktop\Business Expense\My Coding Projects\snake_game"
python run_game.py
```

Run tests:

```powershell
python -m unittest -v tests.test_snake_logic
```

---

## Data Persistence

The game stores score data locally:

- `top_scores.json`
- `high_score.txt`

---

## Design Notes

The UI direction is intentionally retro arcade:

- deep navy background grid
- neon cyan playfield accents
- high-contrast score cards
- compact celebration overlays (to avoid gameplay disruption)

The layout emphasizes clarity and rhythm:

- centered top HUD for score and high score
- single strong playfield border as primary visual anchor
- consistent spacing and themed controls

---

## Built With Codex

This game was developed collaboratively with Codex in iterative pairing sessions.

Workflow highlights:

- started from a minimal classic loop implementation
- separated pure logic from UI rendering
- repeatedly refined UX through focused feedback cycles
- added production-like quality improvements:
  - persistent score systems
  - launch/shortcut ergonomics
  - single-instance safety
  - visual polish and interaction design

The final result reflects rapid prototyping plus continuous polish through human-in-the-loop iteration.

---

## Author

Chris Goyette
