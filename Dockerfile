# ---- build stage ----
FROM maven:3.9-eclipse-temurin-11 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q -B dependency:go-offline || true
COPY src ./src
RUN mvn -q -B -DskipTests package

# ---- runtime stage ----
FROM eclipse-temurin:11-jre
WORKDIR /app

COPY --from=build /build/target/jootm2.jar /app/jootm2.jar
COPY frontend/ /app/frontend/
COPY config/ /app/config/

RUN mkdir -p /app/data /app/resources

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/jootm2.jar", "/app/config/server.properties"]