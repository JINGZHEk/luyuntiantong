import unittest

from src.roadside_perception.coordinate_mapper import CoordinateMapper


class CoordinateMapperTest(unittest.TestCase):
    def test_maps_bbox_bottom_center_with_homography(self):
        mapper = CoordinateMapper(
            homography=[
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, 1.0],
            ]
        )

        result = mapper.image_bbox_to_world([10, 20, 30, 40])

        self.assertEqual(result["status"], "valid")
        self.assertEqual(result["world_pos"], [25.0, 60.0])

    def test_applies_perspective_division(self):
        mapper = CoordinateMapper(
            homography=[
                [2.0, 0.0, 0.0],
                [0.0, 2.0, 0.0],
                [0.0, 0.0, 2.0],
            ]
        )

        result = mapper.image_point_to_world([10, 20])

        self.assertEqual(result, [10.0, 20.0])

    def test_invalid_matrix_and_bounds_return_explicit_invalid_status(self):
        mapper = CoordinateMapper(
            homography=[[1.0, 0.0], [0.0, 1.0]],
            world_bounds={"x": [-1.0, 1.0], "y": [-1.0, 1.0]},
        )

        invalid_matrix = mapper.image_bbox_to_world([0, 0, 10, 10])
        self.assertEqual(invalid_matrix["status"], "invalid")
        self.assertIn("3x3", invalid_matrix["reason"])

        mapper = CoordinateMapper(
            homography=[
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, 1.0],
            ],
            world_bounds={"x": [-1.0, 1.0], "y": [-1.0, 1.0]},
        )
        out_of_bounds = mapper.image_bbox_to_world([10, 10, 10, 10])
        self.assertEqual(out_of_bounds["status"], "invalid")
        self.assertIn("bounds", out_of_bounds["reason"])


if __name__ == "__main__":
    unittest.main()
