from __future__ import annotations

import json
import os
import random
import socket
import tkinter as tk
from dataclasses import dataclass
from tkinter import simpledialog
from typing import Optional

from snake_logic import Direction, SnakeState, create_initial_state, next_direction, step


BOARD_WIDTH = 20
BOARD_HEIGHT = 20
CELL_SIZE = 24
TICK_MS = 120
TOP_SCORES_FILE = os.path.join(os.path.dirname(__file__), "..", "top_scores.json")
ICON_FILE = os.path.join(os.path.dirname(__file__), "..", "assets", "snake-game-custom.ico")
SINGLE_INSTANCE_HOST = "127.0.0.1"
SINGLE_INSTANCE_PORT = 54637


@dataclass
class Theme:
    background: str = "#0b1020"
    grid: str = "#1b2550"
    snake_head: str = "#79f2c0"
    snake_body: str = "#2fd3a7"
    food: str = "#ff5f5f"
    text: str = "#ffffff"


@dataclass
class ConfettiPiece:
    x: float
    y: float
    vx: float
    vy: float
    size: int
    color: str
    life: int


def _acquire_single_instance_lock() -> Optional[socket.socket]:
    lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock_socket.bind((SINGLE_INSTANCE_HOST, SINGLE_INSTANCE_PORT))
        lock_socket.listen(1)
        return lock_socket
    except OSError:
        lock_socket.close()
        return None


class SnakeApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("SNAKE by CHRIS GOYETTE")
        self.root.resizable(False, False)
        self._set_window_icon()

        self.theme = Theme()
        self.rng = random.Random(42)
        self.state: Optional[SnakeState] = None
        self.pending_direction: Optional[Direction] = None
        self.paused = False
        self.game_started = False

        self.top_scores = self._load_top_scores()
        self.high_score = self.top_scores[0]["score"] if self.top_scores else 0
        self.run_start_high_score = self.high_score
        self.celebrated_this_run = False
        self.high_score_celebration_active = False
        self.celebration_frames = 0
        self.celebration_total_frames = 12
        self.score_entry_handled = False
        self.confetti: list[ConfettiPiece] = []
        self.blink_frame = 0
        self.game_over_transition_frames = 0
        self.game_over_transition_total = 42
        self._drag_start_x = 0
        self._drag_start_y = 0

        self._build_ui()
        self._lock_window_size()
        self._center_window()
        self._bind_keys()
        self._render()
        self._tick()
        self.root.mainloop()

    def _build_ui(self) -> None:
        self.root.configure(bg=self.theme.background)
        self.app_frame = tk.Frame(
            self.root,
            bg=self.theme.background,
            highlightthickness=0,
            bd=0,
        )
        self.app_frame.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        self.info_frame = tk.Frame(self.app_frame, bg=self.theme.background)
        self.info_frame.pack(padx=14, pady=(10, 8), fill=tk.X)
        self.info_frame.grid_columnconfigure(0, weight=1)
        self.info_frame.grid_columnconfigure(1, weight=0)
        self.info_frame.grid_columnconfigure(2, weight=0)
        self.info_frame.grid_columnconfigure(3, weight=1)

        self.score_label = tk.Label(
            self.info_frame,
            text="Score: 0",
            fg="#79f2c0",
            bg="#102047",
            font=("Courier New", 12, "bold"),
            width=12,
            anchor="center",
            relief="flat",
            bd=0,
            highlightthickness=1,
            highlightbackground="#79f2c0",
        )
        self.score_label.grid(row=0, column=1, padx=(0, 10), sticky="ew")

        self.high_score_label = tk.Label(
            self.info_frame,
            text=f"High Score: {self.high_score}",
            fg="#ffeb3b",
            bg="#102047",
            font=("Courier New", 12, "bold"),
            width=15,
            anchor="center",
            relief="flat",
            bd=0,
            highlightthickness=1,
            highlightbackground="#79f2c0",
        )
        self.high_score_label.grid(row=0, column=2, padx=(10, 0), sticky="ew")

        self.status_label = tk.Label(
            self.info_frame,
            text="",
            fg=self.theme.text,
            bg=self.theme.background,
            font=("Segoe UI", 10),
            anchor="e",
        )

        self.canvas = tk.Canvas(
            self.app_frame,
            width=BOARD_WIDTH * CELL_SIZE,
            height=BOARD_HEIGHT * CELL_SIZE,
            bg=self.theme.background,
            highlightthickness=0,
            bd=0,
            relief="flat",
        )
        self.canvas.pack(pady=(6, 10))

        controls = tk.Frame(self.app_frame, bg=self.theme.background)
        controls.pack(pady=(0, 10))
        self.start_button = self._make_arcade_button(controls, "Start", self._start_new_game, width=10)
        self.start_button.grid(row=0, column=0, padx=5)
        self.restart_button = self._make_arcade_button(controls, "Restart", self._start_new_game, width=10)
        self.restart_button.grid(row=0, column=1, padx=5)
        self.pause_button = self._make_arcade_button(controls, "Pause", self._toggle_pause, width=10)
        self.pause_button.grid(row=0, column=2, padx=5)
        self.reset_scores_button = self._make_arcade_button(controls, "Reset Scores", self._reset_scores, width=12)
        self.reset_scores_button.grid(row=0, column=3, padx=5)

    def _bind_keys(self) -> None:
        self.root.bind("<Up>", lambda event: self._set_pending((0, -1)))
        self.root.bind("<Down>", lambda event: self._set_pending((0, 1)))
        self.root.bind("<Left>", lambda event: self._set_pending((-1, 0)))
        self.root.bind("<Right>", lambda event: self._set_pending((1, 0)))
        self.root.bind("<w>", lambda event: self._set_pending((0, -1)))
        self.root.bind("<W>", lambda event: self._set_pending((0, -1)))
        self.root.bind("<s>", lambda event: self._set_pending((0, 1)))
        self.root.bind("<S>", lambda event: self._set_pending((0, 1)))
        self.root.bind("<a>", lambda event: self._set_pending((-1, 0)))
        self.root.bind("<A>", lambda event: self._set_pending((-1, 0)))
        self.root.bind("<d>", lambda event: self._set_pending((1, 0)))
        self.root.bind("<D>", lambda event: self._set_pending((1, 0)))
        self.root.bind("<space>", lambda event: self._toggle_pause())
        self.root.bind("<Return>", self._handle_return_key)
        self.root.bind("<KP_Enter>", self._handle_return_key)
        self.root.bind("<Escape>", lambda event: self.root.destroy())

    def _set_pending(self, direction: Direction) -> None:
        if not self.game_started or self.state is None or self.state.game_over:
            return
        self.pending_direction = next_direction(self.state.direction, direction)

    def _start_new_game(self) -> None:
        self.state = create_initial_state(
            board_width=BOARD_WIDTH,
            board_height=BOARD_HEIGHT,
            rng=self.rng.randrange,
        )
        self.game_started = True
        self.confetti = []
        self.high_score_celebration_active = False
        self.celebration_frames = 0
        self.celebrated_this_run = False
        self.score_entry_handled = False
        self.game_over_transition_frames = 0
        self.run_start_high_score = self.high_score
        self.pending_direction = None
        self.paused = False
        self.pause_button.config(text="Pause")
        self.status_label.config(text=self._default_status_text())
        self._render()

    def _toggle_pause(self) -> None:
        if not self.game_started or self.state is None or self.state.game_over:
            return
        self.paused = not self.paused
        self.pause_button.config(text="Resume" if self.paused else "Pause")
        if not self.paused and not self.high_score_celebration_active:
            self.status_label.config(text=self._default_status_text())

    def _tick(self) -> None:
        self.blink_frame += 1

        if self.game_started and self.state is not None and not self.paused and not self.state.game_over:
            next_state = step(
                self.state,
                requested_direction=self.pending_direction,
                rng=self.rng.randrange,
            )
            self.state = next_state
            self._update_high_score_if_needed()
            self.pending_direction = None
            if self.state.game_over:
                self.status_label.config(text="Game Over...")
                self._handle_top_score_entry()
                self.game_over_transition_frames = self.game_over_transition_total

        if self.game_started and self.state is not None and self.state.game_over and self.game_over_transition_frames > 0:
            self.game_over_transition_frames -= 1
            if self.game_over_transition_frames == 0:
                self._return_to_start_screen()

        self._advance_confetti()
        self._render()
        self.root.after(TICK_MS, self._tick)

    def _render(self) -> None:
        self.canvas.delete("all")
        score = self.state.score if self.state is not None else 0
        self.score_label.config(text=f"Score: {score}")
        self.high_score_label.config(text=f"High Score: {self.high_score}")

        for x in range(0, BOARD_WIDTH * CELL_SIZE + 1, CELL_SIZE):
            self.canvas.create_line(x, 0, x, BOARD_HEIGHT * CELL_SIZE, fill=self.theme.grid)
        for y in range(0, BOARD_HEIGHT * CELL_SIZE + 1, CELL_SIZE):
            self.canvas.create_line(0, y, BOARD_WIDTH * CELL_SIZE, y, fill=self.theme.grid)

        if not self.game_started or self.state is None:
            self._draw_start_screen()
            return

        food_x, food_y = self.state.food
        self._draw_cell(food_x, food_y, self.theme.food)

        for index, (x, y) in enumerate(self.state.snake):
            color = self.theme.snake_head if index == 0 else self.theme.snake_body
            self._draw_cell(x, y, color)

        self._draw_confetti()
        self._draw_high_score_celebration()

        if self.state.game_over:
            self._draw_game_over_transition()

        self._draw_playfield_border()

    def _draw_start_screen(self) -> None:
        cx = BOARD_WIDTH * CELL_SIZE / 2
        self.canvas.create_text(
            cx,
            86,
            text="S N A K E",
            fill="#79f2c0",
            font=("Courier New", 28, "bold"),
        )
        self.canvas.create_text(
            cx,
            118,
            text="by CHRIS GOYETTE",
            fill="#4fc3f7",
            font=("Courier New", 13, "bold"),
        )
        if (self.blink_frame // 5) % 2 == 0:
            self.canvas.create_text(
                cx,
                150,
                text="PRESS ENTER TO PLAY",
                fill="#ffeb3b",
                font=("Courier New", 14, "bold"),
            )
            self.canvas.create_text(
                cx,
                174,
                text="(or click Start)",
                fill="#ffffff",
                font=("Courier New", 10),
            )
        self._draw_top_scores_panel(title="TOP 5 LEADERBOARD")
        self._draw_playfield_border()

    def _draw_top_scores_panel(self, title: str, y0: Optional[float] = None) -> None:
        panel_w = 312
        panel_h = 186
        x0 = (BOARD_WIDTH * CELL_SIZE - panel_w) / 2
        if y0 is None:
            y0 = BOARD_HEIGHT * CELL_SIZE / 2 - 18
        x1 = x0 + panel_w
        y1 = y0 + panel_h
        self.canvas.create_rectangle(x0, y0, x1, y1, fill="#0e1630", outline="#79f2c0", width=1)
        self.canvas.create_text(
            (x0 + x1) / 2,
            y0 + 20,
            text=title,
            fill="#ffeb3b",
            font=("Courier New", 12, "bold"),
        )

        if not self.top_scores:
            self.canvas.create_text(
                (x0 + x1) / 2,
                y0 + 92,
                text="NO SCORES YET",
                fill="#ffffff",
                font=("Courier New", 12, "bold"),
            )
            return

        line_y = y0 + 50
        for i, entry in enumerate(self.top_scores, start=1):
            self.canvas.create_text(
                x0 + 16,
                line_y,
                text=f"{i}. {entry['name']}",
                anchor="w",
                fill="#ffffff",
                font=("Courier New", 11, "bold"),
            )
            self.canvas.create_text(
                x1 - 16,
                line_y,
                text=str(entry["score"]),
                anchor="e",
                fill="#79f2c0",
                font=("Courier New", 11, "bold"),
            )
            line_y += 25

    def _draw_cell(self, x: int, y: int, color: str) -> None:
        x0 = x * CELL_SIZE
        y0 = y * CELL_SIZE
        x1 = x0 + CELL_SIZE
        y1 = y0 + CELL_SIZE
        self.canvas.create_rectangle(x0, y0, x1, y1, fill=color, width=0)

    def _make_arcade_button(self, parent, text: str, command, width: int = 10) -> tk.Button:
        button = tk.Button(
            parent,
            text=text,
            width=width,
            command=command,
            font=("Courier New", 10, "bold"),
            bg="#102047",
            fg="#79f2c0",
            activebackground="#163061",
            activeforeground="#ffeb3b",
            relief="flat",
            bd=0,
            highlightthickness=1,
            highlightbackground="#79f2c0",
            highlightcolor="#79f2c0",
            cursor="hand2",
            padx=6,
            pady=4,
        )
        button.bind("<Enter>", lambda event, b=button: self._on_button_hover_enter(b))
        button.bind("<Leave>", lambda event, b=button: self._on_button_hover_leave(b))
        return button

    def _on_button_hover_enter(self, button: tk.Button) -> None:
        button.configure(
            bg="#79f2c0",
            fg="#04120a",
            activebackground="#79f2c0",
            activeforeground="#04120a",
            highlightbackground="#79f2c0",
            highlightcolor="#79f2c0",
            relief="raised",
            bd=1,
        )

    def _on_button_hover_leave(self, button: tk.Button) -> None:
        button.configure(
            bg="#102047",
            fg="#79f2c0",
            activebackground="#163061",
            activeforeground="#ffeb3b",
            highlightbackground="#79f2c0",
            highlightcolor="#79f2c0",
            relief="flat",
            bd=0,
        )

    def _draw_playfield_border(self) -> None:
        max_x = BOARD_WIDTH * CELL_SIZE
        max_y = BOARD_HEIGHT * CELL_SIZE
        outer_width = 2
        outer_inset = 1
        self.canvas.create_rectangle(
            outer_inset,
            outer_inset,
            max_x - outer_inset - 1,
            max_y - outer_inset - 1,
            outline="#79f2c0",
            width=outer_width,
        )

    def _lock_window_size(self) -> None:
        self.root.update_idletasks()
        width = self.root.winfo_reqwidth()
        height = self.root.winfo_reqheight()
        self.root.geometry(f"{width}x{height}")
        self.root.minsize(width, height)
        self.root.maxsize(width, height)

    def _center_window(self) -> None:
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() - width) // 2
        y = (self.root.winfo_screenheight() - height) // 2
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def _set_window_icon(self) -> None:
        try:
            if os.path.exists(ICON_FILE):
                self.root.iconbitmap(ICON_FILE)
        except Exception:
            pass

    def _handle_return_key(self, event=None) -> None:
        if not self.game_started or self.state is None:
            self._start_new_game()

    def _default_status_text(self) -> str:
        return "Use arrows/WASD. Space = pause. Enter = restart."

    def _return_to_start_screen(self) -> None:
        self.game_started = False
        self.state = None
        self.pending_direction = None
        self.paused = False
        self.pause_button.config(text="Pause")
        self.confetti = []
        self.high_score_celebration_active = False
        self.celebration_frames = 0
        self.status_label.config(text="Press Start to Play. Enter = Start.")

    def _draw_game_over_transition(self) -> None:
        if self.state is None:
            return
        max_x = BOARD_WIDTH * CELL_SIZE
        max_y = BOARD_HEIGHT * CELL_SIZE
        frame = self.game_over_transition_total - self.game_over_transition_frames
        center_y = max_y / 2

        # Retro wipe bands that close toward center.
        band = min(max_y / 2, frame * 16)
        self.canvas.create_rectangle(0, 0, max_x, center_y - band, fill="#000000", width=0)
        self.canvas.create_rectangle(0, center_y + band, max_x, max_y, fill="#000000", width=0)

        # Pulsing center text for the brief end animation.
        glow = "#ff5f5f" if frame % 2 == 0 else "#ffeb3b"
        self.canvas.create_text(
            max_x / 2,
            center_y - 52,
            text="GAME OVER",
            fill=glow,
            font=("Courier New", 30, "bold"),
        )
        self.canvas.create_text(
            max_x / 2,
            center_y - 20,
            text="SAVING SCORE...",
            fill="#ffffff",
            font=("Courier New", 12, "bold"),
        )

        # Keep leaderboard visible through the transition with dedicated spacing.
        self._draw_top_scores_panel(
            title="TOP 5 LEADERBOARD",
            y0=(BOARD_HEIGHT * CELL_SIZE / 2) + 8,
        )

    def _load_top_scores(self) -> list[dict[str, int | str]]:
        try:
            with open(TOP_SCORES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            cleaned: list[dict[str, int | str]] = []
            for item in data:
                if isinstance(item, dict):
                    name = str(item.get("name", "PLAYER")).strip() or "PLAYER"
                    score = int(item.get("score", 0))
                    cleaned.append({"name": name[:12].upper(), "score": max(0, score)})
            cleaned.sort(key=lambda x: int(x["score"]), reverse=True)
            return cleaned[:5]
        except (OSError, ValueError, json.JSONDecodeError, TypeError):
            return []

    def _save_top_scores(self) -> None:
        try:
            with open(TOP_SCORES_FILE, "w", encoding="utf-8") as f:
                json.dump(self.top_scores[:5], f, indent=2)
        except OSError:
            pass

    def _reset_scores(self) -> None:
        self.top_scores = []
        self.high_score = 0
        self.run_start_high_score = 0
        self.celebrated_this_run = False
        self.high_score_celebration_active = False
        self.celebration_frames = 0
        self.confetti = []
        self._save_top_scores()
        self.status_label.config(text="Scores reset.")
        self._render()

    def _is_top_five_score(self, score: int) -> bool:
        if score <= 0:
            return False
        if len(self.top_scores) < 5:
            return True
        return score > int(self.top_scores[-1]["score"])

    def _handle_top_score_entry(self) -> None:
        if self.state is None or self.score_entry_handled:
            return
        self.score_entry_handled = True

        score = self.state.score
        if not self._is_top_five_score(score):
            return

        username = simpledialog.askstring(
            "Top 5 Score!",
            "You made the Top 5!\nEnter username (max 12 chars):",
            parent=self.root,
        )
        if username is None:
            username = "PLAYER"
        username = username.strip().upper()
        if not username:
            username = "PLAYER"
        username = username[:12]

        existing_index = None
        for idx, entry in enumerate(self.top_scores):
            if entry["name"] == username:
                existing_index = idx
                break

        if existing_index is not None:
            existing_score = int(self.top_scores[existing_index]["score"])
            if score <= existing_score:
                self.status_label.config(text=f"No update: {username} best is still {existing_score}.")
                return
            self.top_scores[existing_index]["score"] = score
        else:
            self.top_scores.append({"name": username, "score": score})

        self.top_scores.sort(key=lambda x: int(x["score"]), reverse=True)
        self.top_scores = self.top_scores[:5]
        self.high_score = self.top_scores[0]["score"] if self.top_scores else 0
        self._save_top_scores()
        self.status_label.config(text=f"Top 5 updated! ({username} - {score})")

    def _update_high_score_if_needed(self) -> None:
        if self.state is None:
            return
        if self.state.score > self.high_score:
            self.high_score = self.state.score
        if self.state.score > self.run_start_high_score and not self.celebrated_this_run:
            self._trigger_confetti()
            self.celebrated_this_run = True
            self.high_score_celebration_active = True
            self.status_label.config(text="NEW HIGH SCORE!")

    def _trigger_confetti(self) -> None:
        colors = ["#ff5f5f", "#ffeb3b", "#79f2c0", "#4fc3f7", "#ff9f43", "#c084fc"]
        max_x = BOARD_WIDTH * CELL_SIZE
        max_y = BOARD_HEIGHT * CELL_SIZE
        self.celebration_frames = self.celebration_total_frames
        self.confetti = []
        for _ in range(40):
            self.confetti.append(
                ConfettiPiece(
                    x=float(self.rng.randrange(max_x)),
                    y=float(self.rng.randrange(max(1, max_y // 4))),
                    vx=self.rng.uniform(-2.5, 2.5),
                    vy=self.rng.uniform(1.0, 3.5),
                    size=self.rng.randrange(3, 7),
                    color=colors[self.rng.randrange(len(colors))],
                    life=self.rng.randrange(10, 18),
                )
            )

    def _advance_confetti(self) -> None:
        if self.celebration_frames > 0:
            self.celebration_frames -= 1

        if not self.confetti:
            if self.high_score_celebration_active and self.celebration_frames == 0:
                self.high_score_celebration_active = False
                if self.state is not None and not self.state.game_over:
                    self.status_label.config(text=self._default_status_text())
            return

        max_x = BOARD_WIDTH * CELL_SIZE
        max_y = BOARD_HEIGHT * CELL_SIZE
        next_confetti: list[ConfettiPiece] = []
        for piece in self.confetti:
            piece.x += piece.vx
            piece.y += piece.vy
            piece.vy += 0.14
            piece.life -= 1

            if piece.x < 0:
                piece.x = 0
                piece.vx *= -0.6
            elif piece.x > max_x - piece.size:
                piece.x = max_x - piece.size
                piece.vx *= -0.6

            if piece.life > 0 and piece.y < max_y + piece.size:
                next_confetti.append(piece)
        self.confetti = next_confetti

    def _draw_confetti(self) -> None:
        for piece in self.confetti:
            self.canvas.create_rectangle(
                piece.x,
                piece.y,
                piece.x + piece.size,
                piece.y + piece.size,
                fill=piece.color,
                width=0,
            )

    def _draw_high_score_celebration(self) -> None:
        if not self.high_score_celebration_active:
            return

        phase = self.celebration_total_frames - self.celebration_frames
        max_w = BOARD_WIDTH * CELL_SIZE
        box_w = 260
        box_h = 44
        x0 = (max_w - box_w) / 2
        y0 = 12
        x1 = x0 + box_w
        y1 = y0 + box_h

        accent_colors = ["#ffeb3b", "#79f2c0", "#ff9f43", "#4fc3f7"]
        accent = accent_colors[phase % len(accent_colors)]
        border_width = 3 if phase % 2 == 0 else 2

        self.canvas.create_rectangle(
            x0,
            y0,
            x1,
            y1,
            fill="#0e1630",
            outline=accent,
            width=border_width,
        )
        self.canvas.create_text(
            max_w / 2,
            y0 + (box_h / 2),
            text="NEW HIGH SCORE!",
            fill="#ffffff",
            font=("Segoe UI", 14, "bold"),
        )


if __name__ == "__main__":
    instance_lock = _acquire_single_instance_lock()
    if instance_lock is not None:
        SnakeApp()
