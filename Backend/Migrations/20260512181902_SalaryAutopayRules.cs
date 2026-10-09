using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class SalaryAutopayRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "salary_autopay_rules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployerClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    EmployerEmployeeId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    IncomeKindCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Cadence = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DayOfMonth = table.Column<int>(type: "integer", nullable: true),
                    DayOfWeek = table.Column<int>(type: "integer", nullable: true),
                    RunTimeMinutesUtc = table.Column<int>(type: "integer", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    NextRunAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastRunAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "text", nullable: true),
                    PaymentDescription = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_salary_autopay_rules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_salary_autopay_rules_accounts_FromAccountId",
                        column: x => x.FromAccountId,
                        principalTable: "accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_salary_autopay_rules_clients_EmployerClientId",
                        column: x => x.EmployerClientId,
                        principalTable: "clients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_salary_autopay_rules_employer_employees_EmployerEmployeeId",
                        column: x => x.EmployerEmployeeId,
                        principalTable: "employer_employees",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_employer_employees_EmployeeClientId",
                table: "employer_employees",
                column: "EmployeeClientId");

            migrationBuilder.CreateIndex(
                name: "IX_salary_autopay_rules_EmployerClientId",
                table: "salary_autopay_rules",
                column: "EmployerClientId");

            migrationBuilder.CreateIndex(
                name: "IX_salary_autopay_rules_EmployerEmployeeId",
                table: "salary_autopay_rules",
                column: "EmployerEmployeeId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_salary_autopay_rules_FromAccountId",
                table: "salary_autopay_rules",
                column: "FromAccountId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "salary_autopay_rules");

            migrationBuilder.DropIndex(
                name: "IX_employer_employees_EmployeeClientId",
                table: "employer_employees");
        }
    }
}
