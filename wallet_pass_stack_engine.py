"""
wallet_pass_stack_engine.py

Purpose
-------
A priority-driven engine that turns a wallet-pass tech stack into an executable plan:

P0: Governance + measurable definition of success (avoid "taken-for-granted" success)
P1: Customer Journey design (touchpoints, personas, KPIs, feedback loops)
P2: Hypothesis → Experiment → Metrics → Success Criteria (Riskiest-Assumption-First)
P3: Competitive strategy alignment (differentiation/focus) + proof assets (social proof)
P4: Technical payload stubs (Apple pass.json skeleton + Google Wallet generic stub)

Notes
-----
- Apple Wallet pass payloads require Apple Wallet certificates, Pass Type ID, etc.
- Google Wallet requires an issuer account, service account keys, and signed JWT payloads.
This engine outputs structured stubs + a plan, not production credentials.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Literal, Tuple
import uuid
import datetime as dt


# -----------------------------
# Core data structures
# -----------------------------

StrategyType = Literal["differentiation", "cost_leadership", "focus"]
EvidenceStrength = Literal["weak", "medium", "strong"]
HypothesisType = Literal["desirability", "feasibility", "viability"]

@dataclass
class StrategyDecision:
    """
    Competitive strategy alignment:
    - differentiation: uniqueness perceived by customer, loyalty, lower price sensitivity
    - focus: narrow segment served better than broad competitors
    """
    strategy: StrategyType
    target_segment: str
    value_prop: str
    differentiation_levers: List[str] = field(default_factory=list)
    risks: List[str] = field(default_factory=list)

@dataclass
class Touchpoint:
    name: str
    channel: str
    owner: str
    metrics: List[str] = field(default_factory=list)
    friction_points: List[str] = field(default_factory=list)

@dataclass
class JourneyMap:
    """
    5-phase journey approach:
    discovery/data -> segmentation/personas -> mapping/gaps -> interventions -> improvement loop
    """
    personas: List[str]
    phases: List[str]
    touchpoints: List[Touchpoint]
    kpis: Dict[str, str]  # KPI -> why it matters

@dataclass
class Hypothesis:
    statement: str                # Make it testable and specific (who/where/when)
    hypothesis_type: HypothesisType
    riskiest: bool = False        # "most important must be true"
    missing_field_evidence: bool = True

@dataclass
class Experiment:
    """
    Business experiment structure: hypothesis + experiment + metrics + success criteria
    """
    hypothesis_id: str
    experiment_name: str
    design: str
    metrics: List[str]
    success_criteria: Dict[str, Any]
    expected_evidence_strength: EvidenceStrength
    budget_hours: int = 8
    budget_dollars: int = 0

@dataclass
class ProofAsset:
    """
    CRO / social proof as first-class objects.
    """
    asset_type: Literal[
        "testimonial", "review", "expert_endorsement", "media_mention",
        "brand_stat", "customer_favorite", "ugc"
    ]
    source: str
    payload: Dict[str, Any]

@dataclass
class SecurityPolicy:
    """
    Distribution and abuse controls (policy level).
    """
    allow_transfer: bool = False
    max_devices_per_user: int = 1
    rotation_days: int = 30
    require_account_login: bool = True
    revoke_on_share_signal: bool = True
    notes: List[str] = field(default_factory=list)

@dataclass
class PassPayloadStubs:
    """
    Non-credentialed payload stubs. You still need Apple/Google issuer setup.
    """
    apple_pass_json: Dict[str, Any]
    google_wallet_stub: Dict[str, Any]


@dataclass
class WalletPassPlan:
    plan_id: str
    created_utc: str
    strategy: StrategyDecision
    journey: JourneyMap
    hypotheses: List[Hypothesis]
    experiments: List[Experiment]
    proof_assets: List[ProofAsset]
    security_policy: SecurityPolicy
    payloads: PassPayloadStubs
    success_definition: Dict[str, Any]  # Explicit definition to evaluate suboptimality


# -----------------------------
# Engine
# -----------------------------

class WalletPassStackEngine:
    """
    Turns your stack into a concrete plan.

    "Baked in" sources:
    - Competitive strategy alignment (Porter): pick a strategy + segment + levers.
    - Customer journey mapping: build touchpoints, KPIs, continuous improvement loop.
    - Testing business ideas: riskiest assumption first; hypothesis -> experiment -> metrics -> criteria.
    - CRO/social proof: require proof assets + testing discipline (avoid single-shot thinking).
    - Strategy evaluation: define success explicitly; do not assume your strategy is optimal.
    """

    def __init__(self) -> None:
        self._now = dt.datetime.utcnow()

    # ---------- P0: Define success ----------
    def define_success(self) -> Dict[str, Any]:
        # Explicit "what does better mean" definition.
        return {
            "north_star": "active_pass_holders_who_return_monthly",
            "primary_metrics": {
                "activation_rate": "Pass installs / invites sent",
                "repeat_visit_rate": "Clients returning within 30 days / total clients",
                "retention_90d": "Active pass users at 90 days",
                "avg_visit_frequency": "Visits per client per month",
            },
            "guardrails": {
                "fraud_rate": "Duplicate or fraudged redemptions under 1%",
                "support_load": "Support tickets per 100 users under 2",
                "no_show_rate": "Booked-but-missed appointments under 10%",
            },
            "decision_rule": "Scale only if primary metrics improve without guardrail breach."
        }

    # ---------- P3: Strategy (Porter) ----------
    def choose_strategy(
        self,
        strategy: StrategyType,
        target_segment: str,
        value_prop: str,
        differentiation_levers: Optional[List[str]] = None,
        risks: Optional[List[str]] = None,
    ) -> StrategyDecision:
        return StrategyDecision(
            strategy=strategy,
            target_segment=target_segment,
            value_prop=value_prop,
            differentiation_levers=differentiation_levers or [],
            risks=risks or [],
        )

    # ---------- P1: Journey ----------
    def build_journey(
        self,
        personas: List[str],
        touchpoints: List[Touchpoint],
    ) -> JourneyMap:
        phases = [
            "awareness", "acquisition", "activation", "purchase", "retention"
        ]
        kpis = {
            # Common journey KPIs referenced across customer-journey practice:
            "NPS": "loyalty / advocacy signal",
            "CES": "friction / effort signal",
            "conversion_rate": "touchpoints moving users forward",
            "retention_rate": "long-term value and churn control",
            "avg_ticket_value": "revenue per visit trend",
        }
        return JourneyMap(personas=personas, phases=phases, touchpoints=touchpoints, kpis=kpis)

    # ---------- P2: Hypotheses + experiments ----------
    def prioritize_hypotheses(self, hypotheses: List[Hypothesis]) -> List[Hypothesis]:
        """
        Riskiest-Assumption-First:
        - If multiple hypotheses are marked riskiest, keep them at the top.
        - Next: those missing field evidence.
        """
        return sorted(
            hypotheses,
            key=lambda h: (not h.riskiest, not h.missing_field_evidence)
        )

    def design_experiment_card(
        self,
        hypothesis_id: str,
        experiment_name: str,
        design: str,
        metrics: List[str],
        success_criteria: Dict[str, Any],
        expected_evidence_strength: EvidenceStrength,
        budget_hours: int = 8,
        budget_dollars: int = 0,
    ) -> Experiment:
        return Experiment(
            hypothesis_id=hypothesis_id,
            experiment_name=experiment_name,
            design=design,
            metrics=metrics,
            success_criteria=success_criteria,
            expected_evidence_strength=expected_evidence_strength,
            budget_hours=budget_hours,
            budget_dollars=budget_dollars,
        )

    # ---------- CRO / proof assets ----------
    def require_proof_assets(self, assets: List[ProofAsset]) -> List[ProofAsset]:
        """
        Enforces that social proof is represented explicitly (reviews, testimonials, stats, etc.)
        """
        if not assets:
            # Keep this strict: no proof assets = weak conversion potential.
            raise ValueError("At least one ProofAsset is required (testimonial/review/stat/etc.).")
        return assets

    # ---------- Technical payload stubs ----------
    def build_payload_stubs(
        self,
        pass_type: Literal["gift_card", "loyalty", "offer", "event_ticket"],
        org_name: str,
        description: str,
    ) -> PassPayloadStubs:
        serial = str(uuid.uuid4()).upper()

        apple_stub = {
            "formatVersion": 1,
            "passTypeIdentifier": "pass.com.emporiumgrooming.loyalty",
            "teamIdentifier": "YOURTEAMID",
            "organizationName": org_name,
            "description": description,
            "serialNumber": serial,
            "foregroundColor": "rgb(255,255,255)",
            "backgroundColor": "rgb(0,0,0)",
            "labelColor": "rgb(0,191,165)",
            "logoText": "Emporium Grooming",
            "webServiceURL": "https://emporium-wallet-pass.vercel.app/passes/",
            "authenticationToken": "ROTATING_TOKEN_PLACEHOLDER",
            "generic": {
                "primaryFields": [{"key": "client", "label": "Client", "value": "CLIENT_NAME"}],
                "secondaryFields": [
                    {"key": "tier", "label": "Tier", "value": "Platinum"},
                    {"key": "visits", "label": "Visits", "value": "0"},
                ],
                "auxiliaryFields": [
                    {"key": "nextReward", "label": "Next Reward", "value": "25 visits = free haircut"},
                    {"key": "memberSince", "label": "Member Since", "value": "2026"},
                ],
                "backFields": [
                    {"key": "terms", "label": "Terms", "value": "Loyalty rewards are non-transferable. Visit counter resets after reward redemption."},
                    {"key": "contact", "label": "Contact", "value": "emporiumgrooming.com"},
                ],
            },
            "barcodes": [
                {
                    "format": "PKBarcodeFormatQR",
                    "message": f"emporium:{serial}",
                    "messageEncoding": "iso-8859-1",
                }
            ],
            "locations": [
                {
                    "latitude": 40.7580,
                    "longitude": -73.9855,
                    "relevantText": "Welcome to Emporium Grooming & Supply! Show your pass for rewards.",
                }
            ],
            "maxDistance": 500,
        }

        google_stub = {
            "issuerId": "YOUR_ISSUER_ID",
            "classId": "emporium-grooming.loyalty.class",
            "objectId": f"emporium-grooming.{serial}.object",
            "type": pass_type,
            "state": "ACTIVE",
            "cardTitle": "Emporium Grooming & Supply",
            "header": "Loyalty Card",
            "hexBackgroundColor": "#000000",
            "accountId": "USER_ACCOUNT_ID",
            "accountName": "USER_DISPLAY_NAME",
            "barcode": {"type": "QR_CODE", "value": serial},
            "textModulesData": [
                {"header": "Visits", "body": "0"},
                {"header": "Tier", "body": "Platinum"},
                {"header": "Next Reward", "body": "25 visits = free haircut"},
            ],
            "linksModuleData": {"uris": [{"uri": "https://emporiumgrooming.com", "description": "Emporium Grooming & Supply"}]},
            "locations": [{"latitude": 40.7580, "longitude": -73.9855}],
        }

        return PassPayloadStubs(apple_pass_json=apple_stub, google_wallet_stub=google_stub)

    # ---------- Assemble plan ----------
    def build_plan(
        self,
        strategy: StrategyDecision,
        journey: JourneyMap,
        hypotheses: List[Hypothesis],
        experiments: List[Experiment],
        proof_assets: List[ProofAsset],
        security_policy: SecurityPolicy,
        payloads: PassPayloadStubs,
    ) -> WalletPassPlan:
        # P0: explicit success definition
        success = self.define_success()

        # Basic integrity checks: experiments must map to existing hypotheses
        hypothesis_ids = {str(i) for i in range(len(hypotheses))}
        for exp in experiments:
            if exp.hypothesis_id not in hypothesis_ids:
                raise ValueError(f"Experiment references missing hypothesis_id: {exp.hypothesis_id}")

        return WalletPassPlan(
            plan_id=str(uuid.uuid4()),
            created_utc=self._now.isoformat() + "Z",
            strategy=strategy,
            journey=journey,
            hypotheses=hypotheses,
            experiments=experiments,
            proof_assets=self.require_proof_assets(proof_assets),
            security_policy=security_policy,
            payloads=payloads,
            success_definition=success,
        )


# -----------------------------
# Emporium Grooming & Supply
# -----------------------------
if __name__ == "__main__":
    engine = WalletPassStackEngine()

    # P3: Focus strategy — neighborhood barbershop loyalty for repeat clients
    strategy = engine.choose_strategy(
        strategy="focus",
        target_segment="repeat barbershop clients (regular cuts, grooming, product buyers)",
        value_prop="visit-based loyalty rewards + geofence welcome + exclusive member pricing on grooming products",
        differentiation_levers=[
            "free haircut every 25 visits",
            "priority booking for loyalty members",
            "members-only product discounts",
            "birthday month free upgrade (hot towel, beard trim)",
        ],
        risks=["pass sharing between friends", "low adoption if sign-up is friction-heavy", "reward cost if visit frequency is already high"]
    )

    # P1: Customer journey touchpoints
    touchpoints = [
        Touchpoint(
            name="In-shop QR sign-up",
            channel="QR code at register / mirror station",
            owner="Front desk",
            metrics=["activation_rate", "CES"],
            friction_points=["client needs to unlock phone", "Android vs iOS flow differences"],
        ),
        Touchpoint(
            name="Geofence welcome push",
            channel="Apple/Google Wallet lock screen",
            owner="Product",
            metrics=["engagement_rate"],
            friction_points=["location permissions required"],
        ),
        Touchpoint(
            name="Visit check-in",
            channel="QR scan at register",
            owner="Front desk / barber",
            metrics=["visit_count", "conversion_rate"],
            friction_points=["busy shop = skipped scans"],
        ),
        Touchpoint(
            name="Reward redemption",
            channel="POS / register",
            owner="Front desk",
            metrics=["redemption_rate", "avg_ticket_value"],
            friction_points=["staff needs training on reward flow"],
        ),
        Touchpoint(
            name="Re-engagement push",
            channel="Push notification (hasn't visited in 3+ weeks)",
            owner="Growth",
            metrics=["repeat_visit_rate", "retention_90d"],
            friction_points=["notification fatigue if too frequent"],
        ),
        Touchpoint(
            name="Product upsell",
            channel="Back-of-pass info + in-store display",
            owner="Retail / barber",
            metrics=["avg_ticket_value", "product_attach_rate"],
        ),
    ]

    journey = engine.build_journey(
        personas=["regular client (every 2-4 weeks)", "walk-in / first-timer", "product-only buyer"],
        touchpoints=touchpoints,
    )

    # P2: Riskiest assumptions first
    hypotheses = engine.prioritize_hypotheses([
        Hypothesis(
            statement="We believe regular clients will install the wallet pass at the register if the barber explains the free haircut reward and it takes under 30 seconds.",
            hypothesis_type="desirability",
            riskiest=True,
            missing_field_evidence=True,
        ),
        Hypothesis(
            statement="We believe visit-based loyalty (25 visits = free cut) will increase 30-day return rate by 15% compared to no loyalty program.",
            hypothesis_type="viability",
            riskiest=True,
            missing_field_evidence=True,
        ),
        Hypothesis(
            statement="We believe geofence notifications within 500m of the shop will drive at least 5% of pass holders to walk in on days they weren't planning to.",
            hypothesis_type="desirability",
            riskiest=False,
            missing_field_evidence=True,
        ),
        Hypothesis(
            statement="We believe members-only product pricing will increase grooming product sales per visit by 20%.",
            hypothesis_type="viability",
            riskiest=False,
            missing_field_evidence=True,
        ),
    ])

    # Experiments mapped to hypotheses
    experiments = [
        engine.design_experiment_card(
            hypothesis_id="0",
            experiment_name="Register sign-up: barber-assisted vs self-serve QR",
            design="2-week test. Week 1: barber hands phone back with pass installed. Week 2: QR code on mirror, client self-serves. Track installs, time-to-install, drop-off.",
            metrics=["activation_rate", "CES", "time_to_install"],
            success_criteria={"activation_rate": ">= 40%", "time_to_install": "<= 30 seconds"},
            expected_evidence_strength="medium",
            budget_hours=4,
            budget_dollars=0,
        ),
        engine.design_experiment_card(
            hypothesis_id="1",
            experiment_name="Loyalty pass vs no loyalty: 30-day return rate",
            design="Compare 30-day return rate for clients who installed pass (treatment) vs clients who declined (control). Track visit count and average spend.",
            metrics=["repeat_visit_rate", "avg_ticket_value", "visit_count"],
            success_criteria={"repeat_visit_rate": ">= +15% lift", "avg_ticket_value": "no decline"},
            expected_evidence_strength="strong",
            budget_hours=8,
            budget_dollars=0,
        ),
        engine.design_experiment_card(
            hypothesis_id="2",
            experiment_name="Geofence walk-in attribution",
            design="Enable geofence for 30 days. Track pass holders who receive lock-screen notification and visit within 2 hours vs. their historical visit pattern.",
            metrics=["geofence_triggered_visits", "incremental_visit_rate"],
            success_criteria={"incremental_visit_rate": ">= 5%"},
            expected_evidence_strength="medium",
            budget_hours=4,
            budget_dollars=0,
        ),
        engine.design_experiment_card(
            hypothesis_id="3",
            experiment_name="Members-only product pricing impact",
            design="Offer 15% off grooming products to pass holders for 30 days. Compare product revenue per visit for members vs non-members.",
            metrics=["product_attach_rate", "product_revenue_per_visit"],
            success_criteria={"product_attach_rate": ">= +20% lift"},
            expected_evidence_strength="medium",
            budget_hours=4,
            budget_dollars=50,
        ),
    ]

    # Social proof assets
    proof_assets = [
        ProofAsset(
            asset_type="review",
            source="Google Reviews",
            payload={"rating": 4.8, "count": 85, "sample": "Best barbershop in the neighborhood. Always leave looking sharp."},
        ),
        ProofAsset(
            asset_type="brand_stat",
            source="internal",
            payload={"avg_clients_per_day": 35, "repeat_client_pct": 68},
        ),
        ProofAsset(
            asset_type="testimonial",
            source="in-store",
            payload={"quote": "I've been coming here for 2 years. The loyalty card is a no-brainer — free cuts just for showing up.", "name": "Marcus J."},
        ),
        ProofAsset(
            asset_type="customer_favorite",
            source="internal",
            payload={"service": "Classic Fade + Beard Lineup", "popularity": "42% of all bookings"},
        ),
    ]

    # Security policy
    security = SecurityPolicy(
        allow_transfer=False,
        max_devices_per_user=1,
        rotation_days=30,
        require_account_login=True,
        revoke_on_share_signal=True,
        notes=[
            "Rotate auth tokens monthly; revoke on anomaly.",
            "Bind pass to phone — no transfer between devices.",
            "Visit counter is server-side; QR scan increments via API, not on-device.",
            "Staff POS validates pass serial before crediting visit.",
        ]
    )

    # Technical payload stubs
    payloads = engine.build_payload_stubs(
        pass_type="loyalty",
        org_name="Emporium Grooming & Supply",
        description="Emporium Grooming Loyalty Card",
    )

    # Assemble full plan
    plan = engine.build_plan(
        strategy=strategy,
        journey=journey,
        hypotheses=hypotheses,
        experiments=experiments,
        proof_assets=proof_assets,
        security_policy=security,
        payloads=payloads,
    )

    print("=" * 60)
    print("EMPORIUM GROOMING & SUPPLY — WALLET PASS PLAN")
    print("=" * 60)
    print(f"Plan ID:       {plan.plan_id}")
    print(f"Created:       {plan.created_utc}")
    print(f"Strategy:      {plan.strategy.strategy} -> {plan.strategy.target_segment}")
    print(f"Value Prop:    {plan.strategy.value_prop}")
    print(f"Personas:      {', '.join(plan.journey.personas)}")
    print(f"Touchpoints:   {len(plan.journey.touchpoints)}")
    print(f"Hypotheses:    {len(plan.hypotheses)} ({sum(1 for h in plan.hypotheses if h.riskiest)} riskiest)")
    print(f"Experiments:   {len(plan.experiments)}")
    print(f"Proof Assets:  {len(plan.proof_assets)}")
    print(f"North Star:    {plan.success_definition['north_star']}")
    print(f"Apple Serial:  {plan.payloads.apple_pass_json['serialNumber']}")
    print(f"Apple Pass ID: {plan.payloads.apple_pass_json['passTypeIdentifier']}")
    print(f"Google Class:  {plan.payloads.google_wallet_stub['classId']}")
    print("=" * 60)
