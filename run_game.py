import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "src"))

from snake_game_tkinter import SnakeApp  # noqa: E402


if __name__ == "__main__":
    SnakeApp()
