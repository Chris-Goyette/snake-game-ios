import unittest

import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))
from snake_logic import SnakeState, create_initial_state, step, spawn_food


class SequenceRng:
    def __init__(self, values):
        self.values = iter(values)

    def randrange(self, stop):
        return next(self.values) % stop


class SnakeLogicTests(unittest.TestCase):
    def test_snake_moves_forward_and_keeps_length(self):
        state = create_initial_state(
            board_width=10,
            board_height=10,
            rng=lambda stop: 0,
            food_position=(0, 0),
        )
        next_state = step(state, requested_direction=(1, 0))

        self.assertFalse(next_state.game_over)
        self.assertEqual(next_state.score, 0)
        self.assertEqual(next_state.snake[0], (6, 5))
        self.assertEqual(len(next_state.snake), len(state.snake))
        self.assertNotIn((6, 5), next_state.snake[1:])

    def test_snake_grows_when_eating_food(self):
        state = create_initial_state(
            board_width=10,
            board_height=10,
            rng=SequenceRng([0, 0]).randrange,
            food_position=(6, 5),
        )
        next_state = step(state, requested_direction=(1, 0))

        self.assertEqual(next_state.score, 1)
        self.assertEqual(next_state.snake[0], (6, 5))
        self.assertEqual(len(next_state.snake), len(state.snake) + 1)
        self.assertIn((6, 5), next_state.snake)
        self.assertNotEqual(next_state.food, (6, 5))

    def test_wall_collision_sets_game_over(self):
        state = SnakeState(
            board_width=3,
            board_height=3,
            snake=((2, 1), (1, 1)),
            direction=(1, 0),
            food=(0, 0),
            score=0,
        )
        next_state = step(state, requested_direction=(1, 0))

        self.assertTrue(next_state.game_over)
        self.assertEqual(next_state.snake, state.snake)

    def test_self_collision_detected(self):
        state = SnakeState(
            board_width=4,
            board_height=4,
            snake=((2, 1), (1, 1), (1, 2), (2, 2)),
            direction=(1, 0),
            food=(0, 0),
            score=0,
        )
        next_state = step(state, requested_direction=(0, 1))

        self.assertTrue(next_state.game_over)

    def test_food_spawn_avoids_snake(self):
        occupied = {(x, 0) for x in range(5)}
        rng = SequenceRng([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]).randrange
        food = spawn_food(board_width=5, board_height=5, occupied=occupied, rng=rng)
        self.assertNotIn(food, occupied)
        self.assertTrue(0 <= food[0] < 5)
        self.assertTrue(0 <= food[1] < 5)


if __name__ == "__main__":
    unittest.main()
