from pathlib import Path
from typing import Any


def get_model_spec(history_length: int = 8, predict_steps: int = 30, hidden_dim: int = 128) -> dict[str, Any]:
    return {
        "name": "OccAware-STGNN",
        "input_feature_dim": 8,
        "node_features": ["cx", "cy", "w", "h", "vx", "vy", "class_id", "occ_score"],
        "history_length": history_length,
        "predict_steps": predict_steps,
        "hidden_dim": hidden_dim,
        "heads": ["trajectory", "occlusion"],
        "checkpoint_format": "TorchScript",
        "status": "untrained_model_skeleton",
    }


class OccAwareSTGNN:
    def __new__(cls, *args, **kwargs):
        import torch
        import torch.nn as nn

        class _DenseGraphAttention(nn.Module):
            def __init__(self, hidden_dim: int):
                super().__init__()
                self.query = nn.Linear(hidden_dim, hidden_dim)
                self.key = nn.Linear(hidden_dim, hidden_dim)
                self.value = nn.Linear(hidden_dim, hidden_dim)
                self.out = nn.Linear(hidden_dim, hidden_dim)
                self.scale = hidden_dim ** -0.5

            def forward(self, x):
                scores = torch.matmul(self.query(x), self.key(x).transpose(-1, -2)) * self.scale
                weights = torch.softmax(scores, dim=-1)
                context = torch.matmul(weights, self.value(x))
                return self.out(context)

        class _OccAwareSTGNN(nn.Module):
            def __init__(
                self,
                feature_dim: int = 8,
                hidden_dim: int = 128,
                predict_steps: int = 30,
                occlusion_classes: int = 4,
            ):
                super().__init__()
                self.predict_steps = predict_steps
                self.feature_encoder = nn.Sequential(
                    nn.Linear(feature_dim, hidden_dim),
                    nn.LayerNorm(hidden_dim),
                    nn.ELU(),
                )
                self.spatial_attention = _DenseGraphAttention(hidden_dim)
                self.temporal_gru = nn.GRU(hidden_dim, hidden_dim, batch_first=True)
                self.occlusion_head = nn.Sequential(
                    nn.Linear(hidden_dim, hidden_dim // 2),
                    nn.ReLU(),
                    nn.Linear(hidden_dim // 2, occlusion_classes),
                )
                self.trajectory_head = nn.Sequential(
                    nn.Linear(hidden_dim, hidden_dim // 2),
                    nn.ReLU(),
                    nn.Linear(hidden_dim // 2, predict_steps * 2),
                )

            def forward(self, node_features):
                squeeze_node = False
                if node_features.dim() == 3:
                    node_features = node_features.unsqueeze(1)
                    squeeze_node = True

                batch_size, node_count, history_length, feature_dim = node_features.shape
                encoded = self.feature_encoder(node_features.reshape(batch_size * history_length, node_count, feature_dim))
                spatial = encoded + self.spatial_attention(encoded)
                temporal_input = spatial.reshape(batch_size, history_length, node_count, -1).transpose(1, 2)
                temporal_input = temporal_input.reshape(batch_size * node_count, history_length, -1)
                _, hidden = self.temporal_gru(temporal_input)
                hidden = hidden[-1].reshape(batch_size, node_count, -1)

                trajectory = self.trajectory_head(hidden).reshape(batch_size, node_count, self.predict_steps, 2)
                occlusion_logits = self.occlusion_head(hidden)

                if squeeze_node:
                    return trajectory[:, 0], occlusion_logits[:, 0]
                return trajectory, occlusion_logits

        return _OccAwareSTGNN(*args, **kwargs)


def export_torchscript_checkpoint(
    output_path: str | Path,
    history_length: int = 8,
    predict_steps: int = 30,
    hidden_dim: int = 128,
    seed: int = 2026,
) -> Path:
    import torch

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(seed)
    model = OccAwareSTGNN(hidden_dim=hidden_dim, predict_steps=predict_steps)
    model.eval()
    example = torch.zeros(1, history_length, 8, dtype=torch.float32)
    traced = torch.jit.trace(model, example)
    traced.save(str(output))
    return output
