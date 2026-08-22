from abc import ABC, abstractmethod
from typing import Any


class DBConnector(ABC):
    @abstractmethod
    def connect(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_schema(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def execute(self, sql: str) -> tuple[list[str], list[dict[str, Any]]]:
        raise NotImplementedError
