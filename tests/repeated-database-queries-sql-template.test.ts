import assert from "node:assert/strict";
import { test } from "node:test";

import {
    MAX_SQL_TEMPLATE_INPUT_LENGTH,
    normalizeSqlTemplate,
} from "../src/core/repeated-database-queries/sql-template";
import { mysqlDatabaseGroupKey, postgresDatabaseGroupKey } from "../src/core/repeated-database-queries";

test("normalizeSqlTemplate collapses literals and parameter styles", () => {
    assert.equal(
        normalizeSqlTemplate("SELECT * FROM users WHERE id = $1 AND name = 'Ada'"),
        "select * from users where id = ? and name = ?",
    );
    assert.equal(
        normalizeSqlTemplate('SELECT * FROM users WHERE email = "ada@example.com"'),
        "select * from users where email = ?",
    );
    assert.equal(
        normalizeSqlTemplate("SELECT * FROM users WHERE id IN (1, 2, 3)"),
        "select * from users where id in (?)",
    );
});

test("normalizeSqlTemplate rejects batch statements and oversized queries", () => {
    assert.equal(normalizeSqlTemplate("SELECT 1; SELECT 2"), undefined);
    assert.equal(
        normalizeSqlTemplate("x".repeat(MAX_SQL_TEMPLATE_INPUT_LENGTH + 1)),
        undefined,
    );
});

test("relational fingerprints omit inline parameter values", () => {
    const postgres = postgresDatabaseGroupKey({
        "db.system.name": "postgresql",
        "db.query.text": "SELECT * FROM users WHERE id = 42",
    });
    const mysql = mysqlDatabaseGroupKey({
        "db.system.name": "mysql2",
        "db.query.text": "SELECT * FROM users WHERE id = ?",
    });

    assert.match(postgres ?? "", /select \* from users where id = \?/);
    assert.match(mysql ?? "", /select \* from users where id = \?/);
    assert.doesNotMatch(postgres ?? "", /42/);
});