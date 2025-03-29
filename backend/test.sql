select *
from k12_prod.operation.sir_agg_all_attempts_stage st
left join k12_prod.fact.source_assessment_fact__stage_assessment_extract ex
	on st.batch_sk = ex.batch_sk
    and st.learner_assignment_attempt_sk = ex.learner_assignment_attempt_sk
where st.max_event_timestamp > '2025-03-04'
	and st.max_event_timestamp < '2025-03-12'
	and ex.learner_assignment_attempt_sk is null
	order by st.max_event_timestamp desc;