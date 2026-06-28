from src.services.assistant_intelligence_service import AssistantIntelligenceService


def test_ran_definition_is_not_identity_intent():
    svc = AssistantIntelligenceService()
    question = "explique moi c'est quoi ran radio access network"
    assert svc.classify(question) != "identity"


def test_copilot_identity_still_detected():
    svc = AssistantIntelligenceService()
    assert svc.classify("c'est quoi RAN Guardian Copilot") == "identity"
    assert svc.classify("qui es tu") == "identity"
