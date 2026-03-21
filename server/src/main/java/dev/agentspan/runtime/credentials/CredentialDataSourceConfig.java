/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License.
 */
package dev.agentspan.runtime.credentials;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.DataSourceInitializer;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.core.io.ClassPathResource;

import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;

/**
 * Creates a dedicated DataSource for credential tables.
 * Shares the same JDBC URL as Conductor but is a separate connection pool,
 * avoiding conflicts with Conductor's internal DataSource management.
 *
 * <p>Spring's spring.sql.init.mode=always is tied to the primary DataSource.
 * We use a DataSourceInitializer bean instead to explicitly run schema-credentials.sql.</p>
 */
@Configuration
public class CredentialDataSourceConfig {

    private static final Logger log = LoggerFactory.getLogger(CredentialDataSourceConfig.class);

    @Value("${spring.datasource.url:jdbc:sqlite:agent-runtime.db}")
    private String datasourceUrl;

    @Bean("credentialDataSource")
    @Primary
    public DataSource credentialDataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.sqlite.JDBC");
        ds.setUrl(datasourceUrl);
        log.info("Credential DataSource initialized: {}", datasourceUrl);
        return ds;
    }

    @Bean("credentialJdbc")
    public NamedParameterJdbcTemplate credentialJdbc() {
        return new NamedParameterJdbcTemplate(credentialDataSource());
    }

    @Bean
    public DataSourceInitializer credentialSchemaInitializer() {
        DataSourceInitializer initializer = new DataSourceInitializer();
        initializer.setDataSource(credentialDataSource());
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
        populator.addScript(new ClassPathResource("schema-credentials.sql"));
        populator.setContinueOnError(true); // IF NOT EXISTS guards handle re-runs
        initializer.setDatabasePopulator(populator);
        return initializer;
    }
}
