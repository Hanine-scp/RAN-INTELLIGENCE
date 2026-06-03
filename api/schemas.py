from typing import Any

from pydantic import BaseModel, Field


class FilterPayload(BaseModel):
    selected_dates: list[str] = Field(default_factory=list)
    selected_files: list[str] = Field(default_factory=list)
    selected_sites: list[str] = Field(default_factory=list)
    selected_file_dates: list[str] = Field(default_factory=list)
    site_search: str = ""
    date_search: str = ""
    language: str = "Français"


class InventoryPayload(FilterPayload):
    object_types: list[str] = Field(default_factory=list)


class AssistantQuestion(BaseModel):
    question: str


class ApiEnvelope(BaseModel):
    data: Any
