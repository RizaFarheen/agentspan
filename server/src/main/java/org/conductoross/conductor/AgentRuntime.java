/*
 * Copyright (c) 2025 AgentSpan
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

package org.conductoross.conductor;

import java.net.InetAddress;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)
@EnableScheduling
@ComponentScan(
    basePackages = {
        "com.netflix.conductor",
        "io.orkes.conductor",
        "org.conductoross.conductor",
        "dev.agentspan.runtime"
    })
@RequiredArgsConstructor
public class AgentRuntime {

    private final Logger log = LoggerFactory.getLogger(AgentRuntime.class);

    private final Environment environment;

    public static void main(String[] args) {
        SpringApplication.run(AgentRuntime.class, args);
    }

    public void run(ApplicationArguments args) {
        String dbType = environment.getProperty("conductor.db.type", "memory");
        String queueType = environment.getProperty("conductor.queue.type", "memory");
        String indexingType = environment.getProperty("conductor.indexing.type", "memory");
        String port = environment.getProperty("server.port", "8080");
        String contextPath = environment.getProperty("server.servlet.context-path", "");

        String hostname;
        try {
            hostname = InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            hostname = "localhost";
        }

        String serverUrl = String.format("http://%s:%s%s", hostname, port, contextPath);
        log.info("\n\n\n");
        log.info("┌────────────────────────────────────────────────────────────────────────┐");
        log.info("│                    CONDUCTOR SERVER CONFIGURATION                      │");
        log.info("├────────────────────────────────────────────────────────────────────────┤");
        log.info("│  Database Type    : {}", padRight(dbType, 51) + "│");
        log.info("│  Queue Type       : {}", padRight(queueType, 51) + "│");
        log.info("│  Indexing Type    : {}", padRight(indexingType, 51) + "│");
        log.info("│  Server Port      : {}", padRight(port, 51) + "│");
        log.info("├────────────────────────────────────────────────────────────────────────┤");
        log.info("│  Server URL       : {}", padRight(serverUrl, 51) + "│");
        log.info(
            "│  Swagger UI       : {}",
            padRight(serverUrl + "/swagger-ui/index.html", 51) + "│");
        log.info("└────────────────────────────────────────────────────────────────────────┘");
        log.info("\n\n\n");
    }
    private String padRight(String s, int width) {
        if (s.length() >= width) {
            return s.substring(0, width - 3) + "...";
        }
        return String.format("%-" + width + "s", s);
    }
}
