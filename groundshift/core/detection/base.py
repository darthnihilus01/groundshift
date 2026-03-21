from __future__ import annotations
from abc import ABC, abstractmethod
import numpy as np


class BaseDetector(ABC):
    @abstractmethod
    def detect(
        self,
        reference: np.ndarray,  # shape (bands, height, width) float32
        target: np.ndarray      # shape (bands, height, width) float32
    ) -> np.ndarray:            # shape (height, width) float32, values [0,1]
        ...
