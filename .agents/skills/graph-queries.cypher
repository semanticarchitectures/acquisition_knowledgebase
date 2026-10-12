// Initialize Echelon Hierarchy Nodes
MERGE (f:Echelon {name: 'Federal', level: 1})
MERGE (d:Echelon {name: 'DoD', level: 2})
MERGE (a:Echelon {name: 'DAF', level: 3})
MERGE (m:Echelon {name: 'AFMC', level: 4})
MERGE (p:Echelon {name: 'PAE_C3BM', level: 5})
MERGE (o:Echelon {name: 'Program_Office', level: 6});

// Establish Authority Relationships
MATCH (f:Echelon {name: 'Federal'}), (d:Echelon {name: 'DoD'}) MERGE (f)-[:AUTHORITY_OVER]->(d);
MATCH (d:Echelon {name: 'DoD'}), (a:Echelon {name: 'DAF'}) MERGE (d)-[:AUTHORITY_OVER]->(a);
MATCH (a:Echelon {name: 'DAF'}), (m:Echelon {name: 'AFMC'}) MERGE (a)-[:AUTHORITY_OVER]->(m);
MATCH (m:Echelon {name: 'AFMC'}), (p:Echelon {name: 'PAE_C3BM'}) MERGE (m)-[:AUTHORITY_OVER]->(p);
MATCH (p:Echelon {name: 'PAE_C3BM'}), (o:Echelon {name: 'Program_Office'}) MERGE (p)-[:AUTHORITY_OVER]->(o);
