using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    public partial class CurrencyExchange : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "bank_exchange_settings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    SellMarginPercent = table.Column<decimal>(type: "numeric(8,4)", precision: 8, scale: 4, nullable: false),
                    BuyDiscountPercent = table.Column<decimal>(type: "numeric(8,4)", precision: 8, scale: 4, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bank_exchange_settings", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "bank_exchange_settings",
                columns: new[] { "Id", "SellMarginPercent", "BuyDiscountPercent", "UpdatedAt" },
                columnTypes: new[] { "integer", "numeric(8,4)", "numeric(8,4)", "timestamp with time zone" },
                values: new object[] { 1, 2.0m, 2.0m, new DateTimeOffset(2026, 5, 26, 12, 0, 0, TimeSpan.Zero) });

            migrationBuilder.AddColumn<decimal>(
                name: "CounterAmount",
                table: "transactions",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CounterCurrency",
                table: "transactions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRateApplied",
                table: "transactions",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRateCbr",
                table: "transactions",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "bank_exchange_settings");
            migrationBuilder.DropColumn(name: "CounterAmount", table: "transactions");
            migrationBuilder.DropColumn(name: "CounterCurrency", table: "transactions");
            migrationBuilder.DropColumn(name: "ExchangeRateApplied", table: "transactions");
            migrationBuilder.DropColumn(name: "ExchangeRateCbr", table: "transactions");
        }
    }
}
