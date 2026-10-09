FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS build
WORKDIR /src
COPY Backend.csproj .
RUN dotnet restore Backend.csproj --disable-parallel
COPY . .
RUN dotnet publish Backend.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
# Модель не в репозитории: при деплое положите fraud_model.zip рядом с Backend.dll или смонтируйте том.
# См. FraudDetectionService — без файла антифрод по ML отключается, API остаётся рабочим.
ENV ASPNETCORE_URLS=http://+:5000
ENV ASPNETCORE_ENVIRONMENT=Development
EXPOSE 5000
ENTRYPOINT ["dotnet", "Backend.dll"]