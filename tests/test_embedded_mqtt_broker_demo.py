import unittest

from scripts.verify_embedded_mqtt_broker_demo import build_embedded_broker_config, pick_free_port


class EmbeddedMqttBrokerDemoTest(unittest.TestCase):
    def test_embedded_broker_config_allows_local_anonymous_mqtt(self):
        config = build_embedded_broker_config("127.0.0.1", 1884)

        self.assertEqual(config["listeners"]["default"]["bind"], "127.0.0.1:1884")
        self.assertEqual(config["listeners"]["default"]["type"], "tcp")
        self.assertTrue(config["auth"]["allow-anonymous"])
        self.assertFalse(config["topic-check"]["enabled"])

    def test_pick_free_port_returns_bindable_port(self):
        port = pick_free_port("127.0.0.1")

        self.assertIsInstance(port, int)
        self.assertGreater(port, 0)


if __name__ == "__main__":
    unittest.main()
