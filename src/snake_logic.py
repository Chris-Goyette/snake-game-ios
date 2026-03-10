from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable, Optional, Tuple


Position = Tuple[int, int]
Direction = Tuple[int, int]
RandMethod = Callable[[int], int]


@dataclass(frozen=True)
class SnakeState:
    board_width: int
    board_height: int
    snake: Tuple[Position, ...]
    direction: Direction
    food: Position
    score: int = 0
    game_over: bool = False


def _default_rng() -> RandMethod:
    import random

    rng = random.Random()
    return rng.randrange


def create_initial_state(
    *,
    board_width: int = 20,
    board_height: int = 20,
    rng: Optional[RandMethod] = None,
    food_position: Optional[Position] = None,
) -> SnakeState:
    if rng is None:
        rng = _default_rng()
    start_x = board_width // 2
    start_y = board_height // 2
    snake = ((start_x, start_y), (start_x - 1, start_y))
    food = food_position or spawn_food(
        board_width=board_width,
        board_height=board_height,
        occupied=snake,
        rng=rng,
    )
    return SnakeState(
        board_width=board_width,
        board_height=board_height,
        snake=snake,
        direction=(1, 0),
        food=food,
    )


def spawn_food(
    *,
    board_width: int,
    board_height: int,
    occupied: Iterable[Position],
    rng: RandMethod,
) -> Position:
    occupied_set = set(occupied)
    total_cells = board_width * board_height
    if len(occupied_set) >= total_cells:
        raise ValueError("No room left on the board to place food.")

    while True:
        x = rng(board_width)
        y = rng(board_height)
        food = (x, y)
        if food not in occupied_set:
            return food


def _opposite(direction: Direction) -> Direction:
    return (-direction[0], -direction[1])


def next_direction(current_direction: Direction, requested_direction: Optional[Direction]) -> Direction:
    if requested_direction is None:
        return current_direction
    if requested_direction == _opposite(current_direction):
        return current_direction
    return requested_direction


def _head(state: SnakeState) -> Position:
    return state.snake[0]


def _in_bounds(state: SnakeState, position: Position) -> bool:
    x, y = position
    return 0 <= x < state.board_width and 0 <= y < state.board_height


def _body_to_check_for_collision(state: SnakeState, will_grow: bool) -> Tuple[Position, ...]:
    return state.snake if will_grow else state.snake[:-1]


def step(
    state: SnakeState,
    *,
    requested_direction: Optional[Direction] = None,
    rng: Optional[RandMethod] = None,
) -> SnakeState:
    if state.game_over:
        return state

    if rng is None:
        rng = _default_rng()

    direction = next_direction(state.direction, requested_direction)
    hx, hy = _head(state)
    dx, dy = direction
    next_head: Position = (hx + dx, hy + dy)

    if not _in_bounds(state, next_head):
        return SnakeState(
            board_width=state.board_width,
            board_height=state.board_height,
            snake=state.snake,
            direction=direction,
            food=state.food,
            score=state.score,
            game_over=True,
        )

    will_grow = next_head == state.food
    body_for_collision = _body_to_check_for_collision(state, will_grow)
    if next_head in body_for_collision:
        return SnakeState(
            board_width=state.board_width,
            board_height=state.board_height,
            snake=state.snake,
            direction=direction,
            food=state.food,
            score=state.score,
            game_over=True,
        )

    if will_grow:
        next_snake = (next_head,) + state.snake
        next_food = spawn_food(
            board_width=state.board_width,
            board_height=state.board_height,
            occupied=next_snake,
            rng=rng,
        )
        return SnakeState(
            board_width=state.board_width,
            board_height=state.board_height,
            snake=next_snake,
            direction=direction,
            food=next_food,
            score=state.score + 1,
            game_over=False,
        )

    next_snake = (next_head,) + state.snake[:-1]
    return SnakeState(
        board_width=state.board_width,
        board_height=state.board_height,
        snake=next_snake,
        direction=direction,
        food=state.food,
        score=state.score,
        game_over=False,
    )
