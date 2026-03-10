# Snake by Chris Goyette

![Status](https://img.shields.io/badge/status-stable-2fd3a7?style=for-the-badge)
![Language](https://img.shields.io/badge/language-python-blue?style=for-the-badge)
![UI](https://img.shields.io/badge/ui-tkinter-0b1020?style=for-the-badge)
![Version](https://img.shields.io/badge/version-v1.0.0-ffeb3b?style=for-the-badge)

## Product Summary

`Snake by Chris Goyette` is a retro-inspired desktop Snake game built with Python and Tkinter.  
The project combines classic gameplay with modern polish: smooth controls, persistent leaderboard, themed UI, and animated game-state transitions.

## Experience Goals

- Keep the core game loop simple, readable, and deterministic.
- Deliver a visually cohesive retro-arcade style.
- Prioritize responsiveness and low system overhead.
- Make start, game-over, and scoring moments feel intentional and rewarding.

## Core Features

- Classic Snake mechanics:
  - grid movement
  - growth on food
  - collision-based game over
- Keyboard-first controls:
  - arrows or `W/A/S/D`
  - `Enter` to start
  - `Space` to pause
  - `Esc` to exit
- Persistent Top 5 leaderboard with username capture.
- Per-user best-score handling (no duplicate user rows).
- New high-score celebration effects.
- Timed game-over transition before returning to start screen.
- Single-instance protection to prevent duplicate running windows.

## Architecture

- `src/snake_logic.py`
  - pure, deterministic game logic (movement/collision/spawn/score)
- `src/snake_game_tkinter.py`
  - UI rendering, event handling, persistence wiring, transitions, theming
- `tests/test_snake_logic.py`
  - focused unit coverage of gameplay rules

## UX/Design Direction

- Visual language:
  - deep navy base
  - neon cyan primary accents
  - yellow highlight hierarchy
- UI strategy:
  - strong central playfield anchor
  - minimal chrome
  - themed controls with hover feedback
  - balanced spacing and clear information hierarchy

## Performance Notes

- No external runtime dependencies.
- Small-state in-memory updates.
- Lightweight canvas rendering at fixed tick rate.
- Local JSON persistence only (`top_scores.json`).

## Collaboration Note

This project was iteratively built in collaboration with Codex through rapid design-feedback-development loops.  
Each pass improved gameplay feel, visual consistency, and developer ergonomics while preserving the classic Snake core.

## Release

- Current milestone: `v1.0.0`
- Repository: `https://github.com/Chris-Goyette/snake-game`
